import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  CreateRoomResponseSchema,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  accessCookieName,
  csrfCookieName,
} from '../src/auth/auth-token.service.js';
import { csrfHeaderName } from '../src/auth/csrf.guard.js';
import { ScryptPasswordHasher } from '../src/auth/password-hasher.js';
import { createApp } from '../src/create-app.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for room database tests');
}

const database = createDatabaseClient(databaseUrl);
const password = 'correct horse battery staple';
const roomInput = {
  coverImageUrl: 'https://cdn.example.com/live/cover.jpg',
  demoVideoUrl: 'https://video.example.com/demo.mp4',
  description: 'A room for learning distributed systems.',
  title: 'LivePulse Architecture Lab',
};

describe('POST /api/v1/rooms', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    await database.room.deleteMany();
    await database.refreshSession.deleteMany();
    await database.user.deleteMany();
    const passwordHash = await new ScryptPasswordHasher().hash(password);
    await database.user.createMany({
      data: [
        {
          email: 'host@example.com',
          passwordHash,
          role: 'HOST',
        },
        {
          email: 'viewer@example.com',
          passwordHash,
          role: 'VIEWER',
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
    await database.$disconnect();
  });

  it('lets a host create a database-owned draft room', async () => {
    const headers = await authenticatedHeaders('host@example.com');
    const response = await createRoom(headers, roomInput);

    expect(response.statusCode).toBe(201);
    const body = CreateRoomResponseSchema.parse(response.json());
    expect(response.headers['x-request-id']).toBe(body.requestId);
    expect(body.room.status).toBe('DRAFT');
    expect(body.room.title).toBe(roomInput.title);

    const storedRoom = await database.room.findUniqueOrThrow({
      where: { id: body.room.id },
    });
    expect(storedRoom.hostId).toBe(body.room.hostId);
    expect(storedRoom.status).toBe('DRAFT');
    expect(storedRoom.coverImageUrl).toBe(roomInput.coverImageUrl);
  });

  it('rejects an authenticated viewer without creating a room', async () => {
    const headers = await authenticatedHeaders('viewer@example.com');
    const response = await createRoom(headers, roomInput);

    expect(response.statusCode).toBe(403);
    expect(ApiErrorResponseSchema.parse(response.json()).code).toBe(
      ApiErrorCode.Forbidden,
    );
    await expect(database.room.count()).resolves.toBe(0);
  });

  it('rejects an anonymous request before authorization', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'POST',
      payload: roomInput,
      url: '/api/v1/rooms',
    });

    expect(response.statusCode).toBe(401);
    expect(ApiErrorResponseSchema.parse(response.json()).code).toBe(
      ApiErrorCode.Unauthorized,
    );
    await expect(database.room.count()).resolves.toBe(0);
  });

  it('rejects invalid input and client-controlled room state', async () => {
    const headers = await authenticatedHeaders('host@example.com');
    const response = await createRoom(headers, {
      ...roomInput,
      status: 'LIVE',
      title: '',
    });

    expect(response.statusCode).toBe(400);
    expect(ApiErrorResponseSchema.parse(response.json()).code).toBe(
      ApiErrorCode.ValidationError,
    );
    await expect(database.room.count()).resolves.toBe(0);
  });

  async function authenticatedHeaders(email: string) {
    const csrfResponse = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/auth/csrf',
    });
    const bootstrapToken = getCookieValue(
      getSetCookie(csrfResponse, csrfCookieName),
    );
    const loginResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: {
          cookie: `${csrfCookieName}=${bootstrapToken}`,
          [csrfHeaderName]: bootstrapToken,
          origin: 'http://localhost:3000',
        },
        method: 'POST',
        payload: { email, password },
        url: '/api/v1/auth/login',
      });

    expect(loginResponse.statusCode).toBe(200);
    const accessCookie = getSetCookie(loginResponse, accessCookieName);
    const csrfCookie = getSetCookie(loginResponse, csrfCookieName);
    const csrfToken = getCookieValue(csrfCookie);

    return {
      cookie: `${cookiePair(accessCookie)}; ${cookiePair(csrfCookie)}`,
      [csrfHeaderName]: csrfToken,
      origin: 'http://localhost:3000',
    };
  }

  async function createRoom(
    headers: Record<string, string>,
    payload: Record<string, unknown>,
  ) {
    return app.getHttpAdapter().getInstance().inject({
      headers,
      method: 'POST',
      payload,
      url: '/api/v1/rooms',
    });
  }
});

interface CookieResponse {
  headers: Record<string, number | string | string[] | undefined>;
}

function getSetCookie(response: CookieResponse, name: string): string {
  const header = response.headers['set-cookie'];
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

function getCookieValue(setCookie: string): string {
  const pair = cookiePair(setCookie);
  const separator = pair.indexOf('=');

  if (separator < 0) {
    throw new Error('Expected a valid Set-Cookie header');
  }

  return pair.slice(separator + 1);
}

function cookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0] ?? '';
}
