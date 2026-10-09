import 'reflect-metadata';

import { createHash } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  CurrentUserResponseSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  accessCookieName,
  csrfCookieName,
  refreshCookieName,
} from '../src/auth/auth-token.service.js';
import { csrfHeaderName } from '../src/auth/csrf.guard.js';
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
    const csrfCookie = getSetCookie(response, csrfCookieName);
    const refreshCookie = getSetCookie(response, refreshCookieName);
    expect(accessCookie).toContain('HttpOnly');
    expect(accessCookie).toContain('SameSite=Strict');
    expect(accessCookie).toContain('Path=/');
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
    expect(refreshCookie).toContain('Path=/api/v1/auth');
    expect(csrfCookie).toContain('SameSite=Strict');
    expect(csrfCookie).not.toContain('HttpOnly');

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
    const csrfCookie = getSetCookie(loginResponse, csrfCookieName);
    const originalToken = getCookieValue(originalCookie);
    const csrfToken = getCookieValue(csrfCookie);
    const cookieHeader = `${refreshCookieName}=${originalToken}; ${csrfCookieName}=${csrfToken}`;

    const responses = await Promise.all([
      refresh(cookieHeader, csrfToken),
      refresh(cookieHeader, csrfToken),
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

    const reused = await refresh(cookieHeader, csrfToken);
    expect(reused.statusCode).toBe(401);
    expect(ApiErrorResponseSchema.parse(reused.json()).code).toBe(
      ApiErrorCode.InvalidSession,
    );
  });

  it('revokes the database session and clears both cookies on logout', async () => {
    const loginResponse = await login('viewer@example.com', password);
    const refreshCookie = getSetCookie(loginResponse, refreshCookieName);
    const csrfCookie = getSetCookie(loginResponse, csrfCookieName);
    const rawRefreshToken = getCookieValue(refreshCookie);
    const csrfToken = getCookieValue(csrfCookie);
    const cookieHeader = `${refreshCookieName}=${rawRefreshToken}; ${csrfCookieName}=${csrfToken}`;

    const logoutResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: {
          cookie: cookieHeader,
          [csrfHeaderName]: csrfToken,
          origin: 'http://localhost:3000',
        },
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
    expect(getSetCookie(logoutResponse, csrfCookieName)).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
    expect(
      (await database.refreshSession.findFirstOrThrow()).revokedAt,
    ).not.toBeNull();

    expect((await refresh(cookieHeader, csrfToken)).statusCode).toBe(401);
  });

  it('returns the current user only with a valid access cookie', async () => {
    const loginResponse = await login('viewer@example.com', password);
    const accessCookie = getSetCookie(loginResponse, accessCookieName);
    const authenticated = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { cookie: cookiePair(accessCookie) },
        method: 'GET',
        url: '/api/v1/auth/me',
      });
    const anonymous = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expect(authenticated.statusCode).toBe(200);
    expect(
      CurrentUserResponseSchema.parse(authenticated.json()).user,
    ).toMatchObject({
      email: 'viewer@example.com',
      role: 'VIEWER',
    });
    expect(anonymous.statusCode).toBe(401);
    expect(ApiErrorResponseSchema.parse(anonymous.json()).code).toBe(
      ApiErrorCode.Unauthorized,
    );
  });

  it('rejects missing CSRF proof and an untrusted origin', async () => {
    const bootstrap = await csrfBootstrap();
    const missingHeader = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: {
          cookie: `${csrfCookieName}=${bootstrap}`,
          origin: 'http://localhost:3000',
        },
        method: 'POST',
        payload: { email: 'viewer@example.com', password },
        url: '/api/v1/auth/login',
      });
    const untrustedOrigin = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: {
          cookie: `${csrfCookieName}=${bootstrap}`,
          [csrfHeaderName]: bootstrap,
          origin: 'https://attacker.example',
        },
        method: 'POST',
        payload: { email: 'viewer@example.com', password },
        url: '/api/v1/auth/login',
      });

    expect(missingHeader.statusCode).toBe(403);
    expect(untrustedOrigin.statusCode).toBe(403);
    expect(ApiErrorResponseSchema.parse(missingHeader.json()).code).toBe(
      ApiErrorCode.CsrfValidationFailed,
    );
    expect(ApiErrorResponseSchema.parse(untrustedOrigin.json()).code).toBe(
      ApiErrorCode.CsrfValidationFailed,
    );
  });

  async function login(email: string, loginPassword: string) {
    const csrfToken = await csrfBootstrap();
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
        payload: { email, password: loginPassword },
        url: '/api/v1/auth/login',
      });
  }

  async function refresh(cookie: string, csrfToken: string) {
    return app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: {
          cookie,
          [csrfHeaderName]: csrfToken,
          origin: 'http://localhost:3000',
        },
        method: 'POST',
        url: '/api/v1/auth/refresh',
      });
  }

  async function csrfBootstrap(): Promise<string> {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/auth/csrf',
    });

    return getCookieValue(getSetCookie(response, csrfCookieName));
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

function cookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0] ?? '';
}
