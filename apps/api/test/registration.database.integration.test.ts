import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  RegisterResponseSchema,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ScryptPasswordHasher } from '../src/auth/password-hasher.js';
import { csrfCookieName } from '../src/auth/auth-token.service.js';
import { csrfHeaderName } from '../src/auth/csrf.guard.js';
import { createApp } from '../src/create-app.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for registration database tests');
}

const database = createDatabaseClient(databaseUrl);

describe('POST /api/v1/auth/register', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    await database.refreshSession.deleteMany();
    await database.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await database.$disconnect();
  });

  it('creates a viewer with a normalized email and salted password hash', async () => {
    const password = 'correct horse battery staple';
    const response = await register({
      email: '  Viewer@Example.COM ',
      password,
    });

    expect(response.statusCode).toBe(201);
    const body = RegisterResponseSchema.parse(response.json());
    expect(body.user.email).toBe('viewer@example.com');
    expect(body.user.role).toBe('VIEWER');
    expect(response.headers['x-request-id']).toBe(body.requestId);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).not.toContain('password');
    expect(response.body).not.toContain('token');

    const storedUser = await database.user.findUnique({
      select: {
        email: true,
        passwordHash: true,
        role: true,
      },
      where: { id: body.user.id },
    });

    expect(storedUser?.email).toBe('viewer@example.com');
    expect(storedUser?.role).toBe('VIEWER');
    expect(storedUser?.passwordHash).not.toBe(password);
    await expect(
      new ScryptPasswordHasher().verify(
        password,
        storedUser?.passwordHash ?? '',
      ),
    ).resolves.toBe(true);
    await expect(database.refreshSession.count()).resolves.toBe(0);
  });

  it('maps a normalized duplicate email to a stable conflict response', async () => {
    const first = await register({
      email: 'viewer@example.com',
      password: 'first secure password',
    });
    const duplicate = await register({
      email: ' VIEWER@EXAMPLE.COM ',
      password: 'second secure password',
    });

    expect(first.statusCode).toBe(201);
    expect(duplicate.statusCode).toBe(409);
    const error = ApiErrorResponseSchema.parse(duplicate.json());
    expect(error.code).toBe(ApiErrorCode.EmailAlreadyExists);
    expect(duplicate.headers['x-request-id']).toBe(error.requestId);

    await expect(database.user.count()).resolves.toBe(1);
  });

  it('allows exactly one winner for concurrent duplicate registrations', async () => {
    const responses = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        register({
          email: 'concurrent@example.com',
          password: `concurrent secure password ${index}`,
        }),
      ),
    );

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([
      201, 409, 409, 409,
    ]);
    await expect(database.user.count()).resolves.toBe(1);
  });

  it('rejects invalid input without creating a user', async () => {
    const response = await register({
      email: 'not-an-email',
      password: 'short',
      role: 'ADMIN',
    });

    expect(response.statusCode).toBe(400);
    expect(ApiErrorResponseSchema.parse(response.json()).code).toBe(
      ApiErrorCode.ValidationError,
    );

    await expect(database.user.count()).resolves.toBe(0);
  });

  async function register(body: Record<string, unknown>) {
    const csrfResponse = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/auth/csrf',
    });
    const setCookie = csrfResponse.headers['set-cookie'];
    const csrfCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const csrfToken = csrfCookie?.split(';', 1)[0]?.split('=', 2)[1];

    if (!csrfCookie || !csrfToken) {
      throw new Error('Expected a CSRF bootstrap cookie');
    }

    return app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: {
          cookie: `${csrfCookieName}=${csrfToken}`,
          [csrfHeaderName]: csrfToken,
          origin: 'http://localhost:3000',
        },
        method: 'POST',
        payload: body,
        url: '/api/v1/auth/register',
      });
  }
});
