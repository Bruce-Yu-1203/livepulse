import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  CreateReportResponseSchema,
  ListReportsResponseSchema,
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
const adminId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
const secondMessageId = '99999999-9999-4999-8999-999999999999';

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
        {
          email: 'report-admin@example.com',
          id: adminId,
          passwordHash,
          role: 'ADMIN',
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
    await messages.create(secondMessage());

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

  it('lets only administrators review and action the pending queue', async () => {
    const viewerHeaders = await authenticatedHeaders(
      'report-viewer@example.com',
    );
    const dismissalReportResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: viewerHeaders,
        method: 'POST',
        payload: {
          details: 'Context supports keeping this message',
          messageId: secondMessageId,
          reason: 'OTHER',
          roomId,
        },
        url: '/api/v1/reports',
      });
    expect(dismissalReportResponse.statusCode).toBe(201);
    const dismissalReport = CreateReportResponseSchema.parse(
      dismissalReportResponse.json(),
    ).report;

    const forbidden = await app.getHttpAdapter().getInstance().inject({
      headers: viewerHeaders,
      method: 'GET',
      url: '/api/v1/reports',
    });
    expect(forbidden.statusCode).toBe(403);
    expect(ApiErrorResponseSchema.parse(forbidden.json()).code).toBe(
      ApiErrorCode.Forbidden,
    );

    const adminHeaders = await authenticatedHeaders('report-admin@example.com');
    const queue = await app.getHttpAdapter().getInstance().inject({
      headers: adminHeaders,
      method: 'GET',
      url: '/api/v1/reports',
    });
    expect(queue.statusCode).toBe(200);
    const queueItems = ListReportsResponseSchema.parse(queue.json()).items;
    expect(queueItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.objectContaining({
            messageId,
            text: 'Visit every link in this message',
          }),
          messageId,
          status: 'PENDING',
        }),
        expect.objectContaining({
          id: dismissalReport.id,
          message: expect.objectContaining({ messageId: secondMessageId }),
          status: 'PENDING',
        }),
      ]),
    );

    const viewerDismissal = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: viewerHeaders,
        method: 'PATCH',
        payload: { status: 'DISMISSED' },
        url: `/api/v1/reports/${dismissalReport.id}`,
      });
    expect(viewerDismissal.statusCode).toBe(403);

    const missingCsrfDismissal = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { cookie: adminHeaders.cookie },
        method: 'PATCH',
        payload: { status: 'DISMISSED' },
        url: `/api/v1/reports/${dismissalReport.id}`,
      });
    expect(missingCsrfDismissal.statusCode).toBe(403);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const dismissal = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          headers: adminHeaders,
          method: 'PATCH',
          payload: { status: 'DISMISSED' },
          url: `/api/v1/reports/${dismissalReport.id}`,
        });
      expect(dismissal.statusCode).toBe(204);
    }
    await expect(
      database.report.findUniqueOrThrow({
        where: { id: dismissalReport.id },
      }),
    ).resolves.toMatchObject({ status: 'DISMISSED' });
    await expect(
      database.auditLog.count({
        where: {
          action: 'REPORT_DISMISSED',
          actorId: adminId,
          roomId,
          targetId: dismissalReport.id,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      messages.findById(roomId, secondMessageId),
    ).resolves.toMatchObject({ text: 'This message should remain visible' });

    const deletion = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: adminHeaders,
        method: 'DELETE',
        url: `/api/v1/rooms/${roomId}/messages/${messageId}`,
      });
    expect(deletion.statusCode).toBe(204);
    await expect(messages.findById(roomId, messageId)).resolves.toMatchObject({
      deletedAt: expect.any(String),
      text: 'Message removed by moderation',
    });
    await expect(
      database.report.findFirstOrThrow({ where: { messageId, reporterId } }),
    ).resolves.toMatchObject({ status: 'ACTIONED' });
    await expect(
      database.auditLog.count({
        where: {
          action: 'MESSAGE_DELETED',
          actorId: adminId,
          roomId,
          targetId: messageId,
        },
      }),
    ).resolves.toBe(1);

    const actionedReport = queueItems.find(
      (report) => report.messageId === messageId,
    );
    if (!actionedReport) {
      throw new Error('Expected the actioned report in the moderation queue');
    }
    const dismissalConflict = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: adminHeaders,
        method: 'PATCH',
        payload: { status: 'DISMISSED' },
        url: `/api/v1/reports/${actionedReport.id}`,
      });
    expect(dismissalConflict.statusCode).toBe(409);
    expect(ApiErrorResponseSchema.parse(dismissalConflict.json()).code).toBe(
      ApiErrorCode.ReportAlreadyActioned,
    );

    const emptyQueue = await app.getHttpAdapter().getInstance().inject({
      headers: adminHeaders,
      method: 'GET',
      url: '/api/v1/reports',
    });
    expect(ListReportsResponseSchema.parse(emptyQueue.json()).items).toEqual(
      [],
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

function secondMessage(): RoomMessage {
  return {
    acceptedAt: '2026-10-10T21:01:00.000Z',
    authorId,
    clientMessageId: '22222222-2222-4222-8222-222222222222',
    messageId: secondMessageId,
    roomId,
    text: 'This message should remain visible',
  };
}

async function removeFixtures(): Promise<void> {
  await database.auditLog.deleteMany({ where: { roomId } });
  await database.report.deleteMany({ where: { roomId } });
  await database.room.deleteMany({ where: { id: roomId } });
  await database.refreshSession.deleteMany({
    where: { userId: { in: [hostId, authorId, reporterId, adminId] } },
  });
  await database.user.deleteMany({
    where: { id: { in: [hostId, authorId, reporterId, adminId] } },
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
