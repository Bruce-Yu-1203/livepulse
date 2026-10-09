import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  CreateRoomResponseSchema,
  GetRoomResponseSchema,
  ListRoomsResponseSchema,
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

  it('paginates visible rooms without exposing drafts or duplicating ties', async () => {
    const host = await database.user.findUniqueOrThrow({
      where: { email: 'host@example.com' },
    });
    await database.room.createMany({
      data: [
        roomRecord(
          'ffffffff-ffff-4fff-bfff-ffffffffffff',
          host.id,
          'LIVE',
          '2026-10-09T15:30:00.000Z',
        ),
        roomRecord(
          'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
          host.id,
          'ENDED',
          '2026-10-09T15:30:00.000Z',
        ),
        roomRecord(
          '11111111-1111-4111-8111-111111111111',
          host.id,
          'LIVE',
          '2026-10-09T15:00:00.000Z',
        ),
        roomRecord(
          '22222222-2222-4222-8222-222222222222',
          host.id,
          'DRAFT',
          '2026-10-09T16:00:00.000Z',
        ),
      ],
    });

    const firstResponse = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/rooms?limit=2',
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstPage = ListRoomsResponseSchema.parse(firstResponse.json());
    expect(firstPage.items.map(({ id }) => id)).toEqual([
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/rooms?limit=2&cursor=${firstPage.nextCursor}`,
      });
    expect(secondResponse.statusCode).toBe(200);
    const secondPage = ListRoomsResponseSchema.parse(secondResponse.json());
    expect(secondPage.items.map(({ id }) => id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(secondPage.nextCursor).toBeNull();

    const allIds = [...firstPage.items, ...secondPage.items].map(
      ({ id }) => id,
    );
    expect(new Set(allIds).size).toBe(3);
    expect(allIds).not.toContain('22222222-2222-4222-8222-222222222222');
  });

  it('returns visible room details while hiding drafts as not found', async () => {
    const host = await database.user.findUniqueOrThrow({
      where: { email: 'host@example.com' },
    });
    const visibleId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const draftId = '22222222-2222-4222-8222-222222222222';
    await database.room.createMany({
      data: [
        roomRecord(visibleId, host.id, 'LIVE', '2026-10-09T15:30:00.000Z'),
        roomRecord(draftId, host.id, 'DRAFT', '2026-10-09T15:31:00.000Z'),
      ],
    });

    const visible = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/rooms/${visibleId}`,
      });
    const draft = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/rooms/${draftId}`,
      });

    expect(visible.statusCode).toBe(200);
    expect(GetRoomResponseSchema.parse(visible.json()).room.id).toBe(visibleId);
    expect(draft.statusCode).toBe(404);
    expect(ApiErrorResponseSchema.parse(draft.json()).code).toBe(
      ApiErrorCode.NotFound,
    );
  });

  it('rejects malformed identifiers and cursors with stable validation errors', async () => {
    const invalidId = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/rooms/not-a-uuid',
    });
    const invalidCursor = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/rooms?cursor=not%2Bbase64url',
    });

    expect(invalidId.statusCode).toBe(400);
    expect(invalidCursor.statusCode).toBe(400);
    expect(ApiErrorResponseSchema.parse(invalidId.json()).code).toBe(
      ApiErrorCode.ValidationError,
    );
    expect(ApiErrorResponseSchema.parse(invalidCursor.json()).code).toBe(
      ApiErrorCode.ValidationError,
    );
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

function roomRecord(
  id: string,
  hostId: string,
  status: 'DRAFT' | 'ENDED' | 'LIVE',
  createdAt: string,
) {
  return {
    ...roomInput,
    createdAt: new Date(createdAt),
    hostId,
    id,
    status,
    updatedAt: new Date(createdAt),
  };
}
