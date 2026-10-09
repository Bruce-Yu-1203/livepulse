import 'reflect-metadata';

import { createHash } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  accessCookieName,
  refreshCookieName,
} from '../src/auth/auth-token.service.js';
import { ScryptPasswordHasher } from '../src/auth/password-hasher.js';
import { createApp } from '../src/create-app.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for session database tests');
}

const database = createDatabaseClient(databaseUrl);
const password = 'correct horse battery staple';

describe('authentication sessions', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    await database.refreshSession.deleteMany();
    await database.user.deleteMany();
    await database.user.create({
      data: {
        email: 'viewer@example.com',
        passwordHash: await new ScryptPasswordHasher().hash(password),
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await database.$disconnect();
  });

  it('logs in with HttpOnly cookies and stores only the refresh-token hash', async () => {
    const response = await login(' Viewer@Example.COM ', password);

    expect(response.statusCode).toBe(200);
    const body = LoginResponseSchema.parse(response.json());
    expect(body.user.email).toBe('viewer@example.com');
    expect(response.headers['x-request-id']).toBe(body.requestId);
    expect(response.body.toLowerCase()).not.toContain('"token"');
    expect(response.body).not.toContain(password);

    const accessCookie = getSetCookie(response, accessCookieName);
    const refreshCookie = getSetCookie(response, refreshCookieName);
    expect(accessCookie).toContain('HttpOnly');
    expect(accessCookie).toContain('SameSite=Strict');
    expect(accessCookie).toContain('Path=/');
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
    expect(refreshCookie).toContain('Path=/api/v1/auth');

    const rawRefreshToken = getCookieValue(refreshCookie);
    const storedSession = await database.refreshSession.findFirstOrThrow();
    expect(storedSession.tokenHash).toBe(
      createHash('sha256').update(rawRefreshToken).digest('hex'),
    );
    expect(storedSession.tokenHash).not.toContain(rawRefreshToken);
  });

  it('uses one generic error for a wrong password and an unknown email', async () => {
    const wrongPassword = await login(
      'viewer@example.com',
      'this password is definitely wrong',
    );
    const unknownEmail = await login('missing@example.com', password);

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    const firstError = ApiErrorResponseSchema.parse(wrongPassword.json());
    const secondError = ApiErrorResponseSchema.parse(unknownEmail.json());
    expect(firstError.code).toBe(ApiErrorCode.InvalidCredentials);
    expect(secondError.code).toBe(ApiErrorCode.InvalidCredentials);
    expect(firstError.message).toBe(secondError.message);
    await expect(database.refreshSession.count()).resolves.toBe(0);
  });

  it('atomically rotates a refresh token with exactly one concurrent winner', async () => {
    const loginResponse = await login('viewer@example.com', password);
    const originalCookie = getSetCookie(loginResponse, refreshCookieName);
    const originalToken = getCookieValue(originalCookie);
    const cookieHeader = `${refreshCookieName}=${originalToken}`;

    const responses = await Promise.all([
      refresh(cookieHeader),
      refresh(cookieHeader),
    ]);
    const statuses = responses.map(({ statusCode }) => statusCode).sort();

    expect(statuses).toEqual([200, 401]);
    const winner = responses.find(({ statusCode }) => statusCode === 200);
    const loser = responses.find(({ statusCode }) => statusCode === 401);
    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
    RefreshResponseSchema.parse(winner?.json());
    expect(ApiErrorResponseSchema.parse(loser?.json()).code).toBe(
      ApiErrorCode.InvalidSession,
    );

    const rotatedCookie = getSetCookie(winner, refreshCookieName);
    const rotatedToken = getCookieValue(rotatedCookie);
    expect(rotatedToken).not.toBe(originalToken);
    expect((await database.refreshSession.findFirstOrThrow()).tokenHash).toBe(
      createHash('sha256').update(rotatedToken).digest('hex'),
    );

    const reused = await refresh(cookieHeader);
    expect(reused.statusCode).toBe(401);
    expect(ApiErrorResponseSchema.parse(reused.json()).code).toBe(
      ApiErrorCode.InvalidSession,
    );
  });

  it('revokes the database session and clears both cookies on logout', async () => {
    const loginResponse = await login('viewer@example.com', password);
    const refreshCookie = getSetCookie(loginResponse, refreshCookieName);
    const rawRefreshToken = getCookieValue(refreshCookie);
    const cookieHeader = `${refreshCookieName}=${rawRefreshToken}`;

    const logoutResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { cookie: cookieHeader },
        method: 'POST',
        url: '/api/v1/auth/logout',
      });

    expect(logoutResponse.statusCode).toBe(204);
    expect(logoutResponse.body).toBe('');
    expect(getSetCookie(logoutResponse, accessCookieName)).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
    expect(getSetCookie(logoutResponse, refreshCookieName)).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
    expect(
      (await database.refreshSession.findFirstOrThrow()).revokedAt,
    ).not.toBeNull();

    expect((await refresh(cookieHeader)).statusCode).toBe(401);
  });

  async function login(email: string, loginPassword: string) {
    return app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        payload: { email, password: loginPassword },
        url: '/api/v1/auth/login',
      });
  }

  async function refresh(cookie: string) {
    return app.getHttpAdapter().getInstance().inject({
      headers: { cookie },
      method: 'POST',
      url: '/api/v1/auth/refresh',
    });
  }
});

interface CookieResponse {
  headers: Record<string, number | string | string[] | undefined>;
}

function getSetCookie(
  response: CookieResponse | undefined,
  name: string,
): string {
  const header = response?.headers['set-cookie'];
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
  const pair = setCookie.split(';', 1)[0];
  const separator = pair?.indexOf('=') ?? -1;

  if (!pair || separator < 0) {
    throw new Error('Expected a valid Set-Cookie header');
  }

  return pair.slice(separator + 1);
}
