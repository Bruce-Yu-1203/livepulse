import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  CurrentUserResponseSchema,
  LoginResponseSchema,
  RegistrationCompleteResponseSchema,
  RegistrationStartResponseSchema,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { ScryptPasswordHasher } from '../src/auth/password-hasher.js';
import { createApp } from '../src/create-app.js';
import { sessionCookie } from './auth-test-helpers.js';

const databaseUrl = process.env.DATABASE_URL;
const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.RESEND_FROM_EMAIL;
const originalTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;

if (!databaseUrl)
  throw new Error('DATABASE_URL is required for registration tests');
const database = createDatabaseClient(databaseUrl);

describe('verified email registration', () => {
  let app: NestFastifyApplication;
  const sentCodes: string[] = [];

  beforeAll(async () => {
    process.env.RESEND_API_KEY = 're_integration_test';
    process.env.RESEND_FROM_EMAIL = 'LivePulse <verify@example.com>';
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (
        String(input) ===
        'https://challenges.cloudflare.com/turnstile/v0/siteverify'
      ) {
        const body = init?.body as URLSearchParams;
        return new Response(
          JSON.stringify({
            success: body.get('response') !== 'invalid-turnstile-token',
          }),
          { status: 200 },
        );
      }
      if (String(input) !== 'https://api.resend.com/emails') {
        throw new Error(`Unexpected fetch: ${String(input)}`);
      }
      const body = JSON.parse(String(init?.body)) as { text: string };
      const code = body.text.match(/\b\d{6}\b/)?.[0];
      if (!code) throw new Error('Verification email had no code');
      sentCodes.push(code);
      return new Response(JSON.stringify({ id: 'test-email' }), {
        status: 200,
      });
    });
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    sentCodes.length = 0;
    await database.session.deleteMany();
    await database.registrationChallenge.deleteMany();
    await database.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await database.$disconnect();
    vi.restoreAllMocks();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFrom;
    if (originalTurnstileSecret === undefined)
      delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalTurnstileSecret;
  });

  it('rejects failed Turnstile verification before creating a challenge or sending email', async () => {
    const response = await post('/api/v1/auth/registration/start', {
      email: 'viewer@example.com',
      username: 'viewer_one',
      password: 'securepass123',
      turnstileToken: 'invalid-turnstile-token',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'AUTH_TURNSTILE_FAILED' });
    await expect(database.registrationChallenge.count()).resolves.toBe(0);
    expect(sentCodes).toHaveLength(0);
  });

  it('creates a verified user only after the code, then supports auto sign-in', async () => {
    const password = 'securepass123';
    const start = await post('/api/v1/auth/registration/start', {
      email: 'Viewer@Example.com',
      username: 'Viewer_123',
      password,
    });
    expect(start.statusCode).toBe(201);
    expect(RegistrationStartResponseSchema.parse(start.json())).toMatchObject({
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    });
    expect(start.headers['set-cookie']).toBeUndefined();
    await expect(database.user.count()).resolves.toBe(0);
    expect(sentCodes).toHaveLength(1);

    const complete = await post('/api/v1/auth/registration/complete', {
      email: 'viewer@example.com',
      code: sentCodes[0],
    });
    expect(complete.statusCode).toBe(201);
    const { userId } = RegistrationCompleteResponseSchema.parse(
      complete.json(),
    );
    expect(
      await database.user.findUniqueOrThrow({ where: { id: userId } }),
    ).toMatchObject({
      email: 'viewer@example.com',
      emailVerified: true,
      name: 'viewer_123',
      role: 'VIEWER',
      username: 'viewer_123',
    });
    const account = await database.account.findFirstOrThrow({
      where: { userId },
    });
    expect(account.providerId).toBe('credential');
    await expect(
      new ScryptPasswordHasher().verify(password, account.password ?? ''),
    ).resolves.toBe(true);
    await expect(database.registrationChallenge.count()).resolves.toBe(0);

    const login = await post('/api/v1/auth/sign-in/email', {
      email: 'viewer@example.com',
      password,
    });
    expect(login.statusCode).toBe(200);
    expect(LoginResponseSchema.parse(login.json()).user.id).toBe(userId);
    const cookie = sessionCookie(login);
    expect(cookie).toContain('HttpOnly');
    const me = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { cookie: cookie.split(';')[0] },
        method: 'GET',
        url: '/api/v1/auth/me',
      });
    expect(CurrentUserResponseSchema.parse(me.json()).user.username).toBe(
      'viewer_123',
    );
  });

  it('rejects invalid fields and duplicate usernames', async () => {
    for (const input of [
      { email: 'invalid', username: 'viewer_one', password: 'securepass123' },
      { email: 'one@example.com', username: 'four', password: 'securepass123' },
      {
        email: 'one@example.com',
        username: 'viewer_one',
        password: 'abcdefgh',
      },
      {
        email: 'one@example.com',
        username: 'viewer_one',
        password: '12345678',
      },
    ]) {
      expect(
        (await post('/api/v1/auth/registration/start', input)).statusCode,
      ).toBe(400);
    }
    await post('/api/v1/auth/registration/start', {
      email: 'one@example.com',
      username: 'Viewer_One',
      password: 'securepass123',
    });
    await post('/api/v1/auth/registration/complete', {
      email: 'one@example.com',
      code: sentCodes[0],
    });
    const duplicate = await post('/api/v1/auth/registration/start', {
      email: 'two@example.com',
      username: 'viewer_ONE',
      password: 'securepass123',
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({
      code: 'AUTH_USERNAME_ALREADY_REGISTERED',
    });
  });

  it('limits resend to one per email per 60 seconds and rejects repeated wrong codes', async () => {
    const input = {
      email: 'viewer@example.com',
      username: 'viewer_one',
      password: 'securepass123',
    };
    expect(
      (await post('/api/v1/auth/registration/start', input)).statusCode,
    ).toBe(201);
    const retry = await post('/api/v1/auth/registration/start', input);
    expect(retry.statusCode).toBe(429);
    expect(retry.json()).toMatchObject({
      code: 'AUTH_REGISTRATION_RATE_LIMITED',
      retryAfterMs: 60_000,
    });
    expect(sentCodes).toHaveLength(1);
    const originalCode = sentCodes[0];
    await database.registrationChallenge.update({
      where: { email: input.email },
      data: { lastSentAt: new Date(Date.now() - 61_000) },
    });
    expect(
      (await post('/api/v1/auth/registration/start', input)).statusCode,
    ).toBe(201);
    expect(sentCodes).toHaveLength(2);
    if (originalCode !== sentCodes[1]) {
      expect(
        (
          await post('/api/v1/auth/registration/complete', {
            email: input.email,
            code: originalCode,
          })
        ).statusCode,
      ).toBe(400);
    }
    const wrongCode = sentCodes[1] === '999999' ? '888888' : '999999';
    for (
      let attempt = 0;
      attempt < (originalCode === sentCodes[1] ? 5 : 4);
      attempt += 1
    ) {
      expect(
        (
          await post('/api/v1/auth/registration/complete', {
            email: input.email,
            code: wrongCode,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await post('/api/v1/auth/registration/complete', {
          email: input.email,
          code: sentCodes[1],
        })
      ).statusCode,
    ).toBe(400);
    await expect(database.user.count()).resolves.toBe(0);
  });

  it('keeps the username unique when two pending accounts choose it', async () => {
    const password = 'securepass123';
    expect(
      (
        await post('/api/v1/auth/registration/start', {
          email: 'one@example.com',
          username: 'shared_name',
          password,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await post('/api/v1/auth/registration/start', {
          email: 'two@example.com',
          username: 'shared_name',
          password,
        })
      ).statusCode,
    ).toBe(201);

    const first = await post('/api/v1/auth/registration/complete', {
      email: 'one@example.com',
      code: sentCodes[0],
    });
    const second = await post('/api/v1/auth/registration/complete', {
      email: 'two@example.com',
      code: sentCodes[1],
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      code: 'AUTH_USERNAME_ALREADY_REGISTERED',
    });
    await expect(database.user.count()).resolves.toBe(1);
  });

  it('blocks the old direct sign-up path and foreign origins', async () => {
    expect(
      (
        await post('/api/v1/auth/sign-up/email', {
          email: 'viewer@example.com',
          name: 'Viewer',
          password: 'securepass123',
        })
      ).statusCode,
    ).toBe(400);
    const foreign = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { origin: 'https://attacker.example' },
        method: 'POST',
        payload: {
          email: 'viewer@example.com',
          username: 'viewer_one',
          password: 'securepass123',
        },
        url: '/api/v1/auth/registration/start',
      });
    expect(foreign.statusCode).toBe(403);
    await expect(database.user.count()).resolves.toBe(0);
  });

  function post(url: string, payload: Record<string, unknown>) {
    return app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { origin: 'http://localhost:3000' },
        method: 'POST',
        payload:
          url === '/api/v1/auth/registration/start'
            ? {
                ...payload,
                turnstileToken:
                  payload.turnstileToken ?? 'XXXX.DUMMY.TOKEN.XXXX',
              }
            : payload,
        url,
      });
  }
});
