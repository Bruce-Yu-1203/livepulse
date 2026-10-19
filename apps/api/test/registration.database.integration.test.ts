import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  AuthProvidersResponseSchema,
  RegisterResponseSchema,
  SocialSignInResponseSchema,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ScryptPasswordHasher } from '../src/auth/password-hasher.js';
import { createApp } from '../src/create-app.js';
import { sessionCookie } from './auth-test-helpers.js';

const databaseUrl = process.env.DATABASE_URL;
const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
const originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for registration database tests');
}

const database = createDatabaseClient(databaseUrl);

describe('POST /api/v1/auth/sign-up/email', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
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
    restoreEnvironment('GOOGLE_CLIENT_ID', originalGoogleClientId);
    restoreEnvironment('GOOGLE_CLIENT_SECRET', originalGoogleClientSecret);
  });

  it('advertises Google and starts an OAuth authorization flow', async () => {
    const providersResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'GET', url: '/api/v1/auth/providers' });

    expect(providersResponse.statusCode).toBe(200);
    expect(AuthProvidersResponseSchema.parse(providersResponse.json())).toEqual(
      { providers: ['google'] },
    );

    const signInResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { origin: 'http://localhost:3000' },
        method: 'POST',
        payload: {
          callbackURL: 'http://localhost:3000',
          disableRedirect: true,
          errorCallbackURL: 'http://localhost:3000/auth',
          provider: 'google',
        },
        url: '/api/v1/auth/sign-in/social',
      });

    expect(signInResponse.statusCode).toBe(200);
    const signIn = SocialSignInResponseSchema.parse(signInResponse.json());
    const authorizationUrl = new URL(signIn.url);
    expect(signIn.redirect).toBe(false);
    expect(authorizationUrl.hostname).toBe('accounts.google.com');
    expect(authorizationUrl.searchParams.get('client_id')).toBe(
      'test-google-client-id',
    );
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3001/api/v1/auth/callback/google',
    );
    const setCookie = signInResponse.headers['set-cookie'];
    expect(
      Array.isArray(setCookie) ? setCookie.join('; ') : setCookie,
    ).toContain('SameSite=Lax');
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

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
