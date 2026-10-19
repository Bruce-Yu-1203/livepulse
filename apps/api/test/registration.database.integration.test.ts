import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { RegisterResponseSchema } from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ScryptPasswordHasher } from '../src/auth/password-hasher.js';
import { createApp } from '../src/create-app.js';
import { sessionCookie } from './auth-test-helpers.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for registration database tests');
}

const database = createDatabaseClient(databaseUrl);

describe('POST /api/v1/auth/sign-up/email', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    await database.session.deleteMany();
    await database.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await database.$disconnect();
  });

  it('creates a signed-in viewer and credential account', async () => {
    const password = 'correct horse battery staple';
    const response = await register({
      email: 'viewer@example.com',
      name: 'Viewer',
      password,
      role: 'ADMIN',
    });

    expect(response.statusCode).toBe(200);
    const body = RegisterResponseSchema.parse(response.json());
    expect(body.user).toMatchObject({
      email: 'viewer@example.com',
      name: 'Viewer',
      role: 'VIEWER',
    });
    expect(sessionCookie(response)).toContain('HttpOnly');

    const account = await database.account.findFirstOrThrow({
      where: { userId: body.user.id },
    });
    expect(account.providerId).toBe('credential');
    expect(account.password).not.toBe(password);
    await expect(
      new ScryptPasswordHasher().verify(password, account.password ?? ''),
    ).resolves.toBe(true);
    await expect(database.session.count()).resolves.toBe(1);
  });

  it('rejects invalid input without creating a user', async () => {
    const response = await register({
      email: 'not-an-email',
      name: '',
      password: 'short',
    });

    expect(response.statusCode).toBe(400);
    await expect(database.user.count()).resolves.toBe(0);
  });

  it('rejects an untrusted origin', async () => {
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { origin: 'https://attacker.example' },
        method: 'POST',
        payload: {
          email: 'viewer@example.com',
          name: 'Viewer',
          password: 'correct horse battery staple',
        },
        url: '/api/v1/auth/sign-up/email',
      });

    expect(response.statusCode).toBe(403);
    await expect(database.user.count()).resolves.toBe(0);
  });

  function register(body: Record<string, unknown>) {
    return app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { origin: 'http://localhost:3000' },
        method: 'POST',
        payload: body,
        url: '/api/v1/auth/sign-up/email',
      });
  }
});
