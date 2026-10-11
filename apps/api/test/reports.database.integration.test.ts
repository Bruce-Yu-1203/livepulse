import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  CreateReportResponseSchema,
  type RoomMessage,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  accessCookieName,
  csrfCookieName,
} from '../src/auth/auth-token.service.js';
import { csrfHeaderName } from '../src/auth/csrf.guard.js';
import { ScryptPasswordHasher } from '../src/auth/password-hasher.js';
import { createApp } from '../src/create-app.js';
import { MongoMessagesRepository } from '../src/messages/messages.repository.js';

const databaseUrl = process.env.DATABASE_URL;
const mongoUrl = process.env.MONGODB_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for report database tests');
}

if (!mongoUrl) {
  throw new Error('MONGODB_URL is required for report database tests');
}

const mongoDatabaseName = new URL(mongoUrl).pathname.slice(1);
if (!mongoDatabaseName.startsWith('livepulse_test_')) {
  throw new Error('Report database tests require an isolated MongoDB database');
}

const database = createDatabaseClient(databaseUrl);
const password = 'correct horse battery staple';
const hostId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const authorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const reporterId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const roomId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const messageId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('POST /api/v1/reports', () => {
  let app: NestFastifyApplication;
  let messages: MongoMessagesRepository;

  beforeAll(async () => {
    await removeFixtures();
    const passwordHash = await new ScryptPasswordHasher().hash(password);
    await database.user.createMany({
      data: [
        {
          email: 'report-host@example.com',
          id: hostId,
          passwordHash,
          role: 'HOST',
        },
        {
          email: 'report-author@example.com',
          id: authorId,
          passwordHash,
          role: 'VIEWER',
        },
        {
          email: 'report-viewer@example.com',
          id: reporterId,
          passwordHash,
          role: 'VIEWER',
        },
      ],
    });
    await database.room.create({
      data: {
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
        demoVideoUrl: 'https://video.example.com/demo.mp4',
        description: 'A room for report integration tests.',
        hostId,
        id: roomId,
        status: 'LIVE',
        title: 'Report room',
      },
    });
    messages = new MongoMessagesRepository();
    await messages.create(message());

    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await messages.onModuleDestroy();
    await removeFixtures();
    await database.$disconnect();
    const mongo = new MongoClient(mongoUrl);
    await mongo.db().dropDatabase();
    await mongo.close();
  });

  it('creates one audited report when a viewer retries the request', async () => {
    const headers = await authenticatedHeaders('report-viewer@example.com');
    const responses = [];

    for (const details of ['Repeated links', 'A retry with changed details']) {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          headers,
          method: 'POST',
          payload: { details, messageId, reason: 'SPAM', roomId },
          url: '/api/v1/reports',
        });
      expect(response.statusCode).toBe(201);
      responses.push(CreateReportResponseSchema.parse(response.json()));
    }

    expect(responses[1]?.report.id).toBe(responses[0]?.report.id);
    expect(responses[1]?.report.details).toBe('Repeated links');
    await expect(
      database.report.count({ where: { messageId, reporterId } }),
    ).resolves.toBe(1);
    await expect(
      database.auditLog.count({
        where: {
          action: 'MESSAGE_REPORTED',
          actorId: reporterId,
          roomId,
          targetId: messageId,
        },
      }),
    ).resolves.toBe(1);
  });

  it('rejects self-reports and room-message mismatches', async () => {
    const authorHeaders = await authenticatedHeaders(
      'report-author@example.com',
    );
    const selfReport = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: authorHeaders,
        method: 'POST',
        payload: { messageId, reason: 'OTHER', roomId },
        url: '/api/v1/reports',
      });
    expect(selfReport.statusCode).toBe(400);
    expect(ApiErrorResponseSchema.parse(selfReport.json()).code).toBe(
      ApiErrorCode.ValidationError,
    );

    const reporterHeaders = await authenticatedHeaders(
      'report-viewer@example.com',
    );
    const mismatch = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: reporterHeaders,
        method: 'POST',
        payload: {
          messageId,
          reason: 'HARASSMENT',
          roomId: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
        },
        url: '/api/v1/reports',
      });
    expect(mismatch.statusCode).toBe(404);
    expect(ApiErrorResponseSchema.parse(mismatch.json()).code).toBe(
      ApiErrorCode.NotFound,
    );
  });

  it('requires both authentication and CSRF validation', async () => {
    const payload = { messageId, reason: 'HATE_SPEECH', roomId };
    const anonymous = await app.getHttpAdapter().getInstance().inject({
      method: 'POST',
      payload,
      url: '/api/v1/reports',
    });
    expect(anonymous.statusCode).toBe(401);
    expect(ApiErrorResponseSchema.parse(anonymous.json()).code).toBe(
      ApiErrorCode.Unauthorized,
    );

    const headers = await authenticatedHeaders('report-viewer@example.com');
    const missingCsrf = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { cookie: headers.cookie },
        method: 'POST',
        payload,
        url: '/api/v1/reports',
      });
    expect(missingCsrf.statusCode).toBe(403);
    expect(ApiErrorResponseSchema.parse(missingCsrf.json()).code).toBe(
      ApiErrorCode.CsrfValidationFailed,
    );
  });

  async function authenticatedHeaders(email: string) {
    const csrfResponse = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/auth/csrf',
    });
    const bootstrapCsrfCookie = getSetCookie(
      csrfResponse.headers,
      csrfCookieName,
    );
    const bootstrapCsrfToken = cookieValue(bootstrapCsrfCookie);
    const login = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: {
          cookie: cookiePair(bootstrapCsrfCookie),
          [csrfHeaderName]: bootstrapCsrfToken,
          origin: 'http://localhost:3000',
        },
        method: 'POST',
        payload: { email, password },
        url: '/api/v1/auth/login',
      });
    expect(login.statusCode).toBe(200);
    const accessCookie = getSetCookie(login.headers, accessCookieName);
    const csrfCookie = getSetCookie(login.headers, csrfCookieName);

    return {
      cookie: `${cookiePair(accessCookie)}; ${cookiePair(csrfCookie)}`,
      [csrfHeaderName]: cookieValue(csrfCookie),
      origin: 'http://localhost:3000',
    };
  }
});

function message(): RoomMessage {
  return {
    acceptedAt: '2026-10-10T21:00:00.000Z',
    authorId,
    clientMessageId: '11111111-1111-4111-8111-111111111111',
    messageId,
    roomId,
    text: 'Visit every link in this message',
  };
}

async function removeFixtures(): Promise<void> {
  await database.auditLog.deleteMany({ where: { roomId } });
  await database.report.deleteMany({ where: { roomId } });
  await database.room.deleteMany({ where: { id: roomId } });
  await database.refreshSession.deleteMany({
    where: { userId: { in: [hostId, authorId, reporterId] } },
  });
  await database.user.deleteMany({
    where: { id: { in: [hostId, authorId, reporterId] } },
  });
}

function getSetCookie(
  headers: Record<string, number | string | string[] | undefined>,
  name: string,
): string {
  const header = headers['set-cookie'];
  const cookies = Array.isArray(header)
    ? header
    : typeof header === 'string'
      ? [header]
      : [];
  const cookie = cookies.find((candidate) => candidate.startsWith(`${name}=`));

  if (!cookie) {
    throw new Error(`Expected the ${name} cookie`);
  }

  return cookie;
}

function cookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0] ?? '';
}

function cookieValue(setCookie: string): string {
  return cookiePair(setCookie).split('=', 2)[1] ?? '';
}
