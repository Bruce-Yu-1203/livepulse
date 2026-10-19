import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  CurrentUserResponseSchema,
  LoginResponseSchema,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sessionCookieName } from '../src/auth/better-auth.service.js';
import { createApp } from '../src/create-app.js';
import {
  cookiePair,
  createCredentialUser,
  sessionCookie,
  signIn,
} from './auth-test-helpers.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for session database tests');
}

const database = createDatabaseClient(databaseUrl);
const password = 'correct horse battery staple';

describe('Better Auth sessions', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    await database.session.deleteMany();
    await database.user.deleteMany();
    await createCredentialUser(database, {
      email: 'viewer@example.com',
      password,
    });
  });

  afterAll(async () => {
    await app.close();
    await database.$disconnect();
  });

  it('creates one HttpOnly database session cookie on sign in', async () => {
    const response = await signIn(app, 'viewer@example.com', password);

    expect(response.statusCode).toBe(200);
    expect(LoginResponseSchema.parse(response.json()).user.email).toBe(
      'viewer@example.com',
    );
    const cookie = sessionCookie(response);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(response.body).not.toContain(password);
    await expect(database.session.count()).resolves.toBe(1);
  });

  it('returns the same generic error for invalid credentials', async () => {
    const wrongPassword = await signIn(
      app,
      'viewer@example.com',
      'this password is definitely wrong',
    );
    const unknownEmail = await signIn(app, 'missing@example.com', password);

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json().message).toBe(unknownEmail.json().message);
    await expect(database.session.count()).resolves.toBe(0);
  });

  it('persists the session across requests and exposes the NestJS principal', async () => {
    const login = await signIn(app, 'viewer@example.com', password);
    const cookie = cookiePair(sessionCookie(login));
    const session = await app.getHttpAdapter().getInstance().inject({
      headers: { cookie },
      method: 'GET',
      url: '/api/v1/auth/get-session',
    });
    const currentUser = await app.getHttpAdapter().getInstance().inject({
      headers: { cookie },
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expect(session.statusCode).toBe(200);
    expect(session.json().user.role).toBe('VIEWER');
    expect(CurrentUserResponseSchema.parse(currentUser.json()).user.email).toBe(
      'viewer@example.com',
    );
  });

  it('revokes the database session and clears the cookie on sign out', async () => {
    const login = await signIn(app, 'viewer@example.com', password);
    const cookie = cookiePair(sessionCookie(login));
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { cookie, origin: 'http://localhost:3000' },
        method: 'POST',
        url: '/api/v1/auth/sign-out',
      });

    expect(response.statusCode).toBe(200);
    expect(sessionCookie(response)).toContain('Max-Age=0');
    await expect(database.session.count()).resolves.toBe(0);
  });

  it('rejects revoked and missing sessions on protected NestJS routes', async () => {
    const login = await signIn(app, 'viewer@example.com', password);
    const cookie = cookiePair(sessionCookie(login));
    await database.session.deleteMany();

    for (const headers of [{ cookie }, {}]) {
      const response = await app.getHttpAdapter().getInstance().inject({
        headers,
        method: 'GET',
        url: '/api/v1/auth/me',
      });
      expect(response.statusCode).toBe(401);
      expect(ApiErrorResponseSchema.parse(response.json()).code).toBe(
        ApiErrorCode.Unauthorized,
      );
    }
  });

  it('enforces trusted origins and removes the legacy refresh endpoint', async () => {
    const untrusted = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { origin: 'https://attacker.example' },
        method: 'POST',
        payload: { email: 'viewer@example.com', password },
        url: '/api/v1/auth/sign-in/email',
      });
    const refresh = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { origin: 'http://localhost:3000' },
        method: 'POST',
        url: '/api/v1/auth/refresh',
      });

    expect(untrusted.statusCode).toBe(403);
    expect(refresh.statusCode).toBe(404);
    expect(refresh.headers['set-cookie']).toBeUndefined();
    expect(untrusted.headers['set-cookie']).toBeUndefined();
    expect(sessionCookieName).toBe('livepulse.session_token');
  });
});
