import { HttpException } from '@nestjs/common';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { HttpRateLimiter } from '../rate-limit/http-rate-limiter.js';
import { mountBetterAuth } from './better-auth-handler.js';
import type { BetterAuthService } from './better-auth.service.js';
import type { TurnstileVerifier } from './turnstile-verifier.js';

describe('Better Auth email sign-in challenge', () => {
  it('publishes a committed sign-out and ignores an unsuccessful revocation', async () => {
    const publishControl = vi.fn().mockResolvedValue(undefined);
    const sessionExists = vi.fn().mockResolvedValue(false);
    const server = Fastify();
    mountBetterAuth(
      server,
      {
        apiOrigin: 'http://localhost:3001',
        auth: {
          handler: vi
            .fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200 }))
            .mockResolvedValueOnce(new Response('{}', { status: 401 })),
        },
        sessionPrincipalFromHeaders: vi.fn().mockResolvedValue({
          expiresAt: new Date(Date.now() + 60_000),
          principal: {
            role: 'VIEWER',
            sessionId: 'session-1',
            userId: 'user-1',
          },
        }),
        sessionExists,
        trustedWebOrigin: 'http://localhost:3000',
      } as unknown as BetterAuthService,
      {
        reserveIdentity: vi.fn(),
        releaseIdentity: vi.fn(),
      },
      { verify: vi.fn() },
      {
        publishControl,
        subscribeControl: vi.fn(),
        subscribeReconnect: vi.fn(),
      },
    );

    try {
      const request = {
        headers: { origin: 'http://localhost:3000' },
        method: 'POST' as const,
        url: '/api/v1/auth/sign-out',
      };
      expect((await server.inject(request)).statusCode).toBe(200);
      expect(publishControl).toHaveBeenCalledWith({
        type: 'session.revoked',
        sessionId: 'session-1',
      });
      expect(sessionExists).toHaveBeenCalledWith('session-1');
      expect((await server.inject(request)).statusCode).toBe(401);
      expect(publishControl).toHaveBeenCalledOnce();
    } finally {
      await server.close();
    }
  });

  it('targets single-session and user-wide Better Auth revocations', async () => {
    const publishControl = vi.fn().mockResolvedValue(undefined);
    const server = Fastify();
    mountBetterAuth(
      server,
      {
        apiOrigin: 'http://localhost:3001',
        auth: {
          handler: vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(new Response('{}', { status: 200 })),
            ),
        },
        sessionPrincipalFromHeaders: vi.fn().mockResolvedValue({
          expiresAt: new Date(Date.now() + 60_000),
          principal: {
            role: 'VIEWER',
            sessionId: 'current-session',
            userId: 'user-1',
          },
        }),
        sessionByToken: vi.fn().mockResolvedValue({
          id: 'other-session',
          userId: 'user-1',
        }),
        sessionExists: vi.fn().mockResolvedValue(false),
        trustedWebOrigin: 'http://localhost:3000',
      } as unknown as BetterAuthService,
      { reserveIdentity: vi.fn(), releaseIdentity: vi.fn() },
      { verify: vi.fn() },
      {
        publishControl,
        subscribeControl: vi.fn(),
        subscribeReconnect: vi.fn(),
      },
    );

    try {
      for (const [path, body] of [
        ['revoke-session', { token: 'opaque-token' }],
        ['revoke-other-sessions', {}],
        ['revoke-sessions', {}],
        ['change-password', { revokeOtherSessions: true }],
      ] as const) {
        expect(
          (
            await server.inject({
              headers: { origin: 'http://localhost:3000' },
              method: 'POST',
              payload: body,
              url: `/api/v1/auth/${path}`,
            })
          ).statusCode,
        ).toBe(200);
      }
      expect(publishControl.mock.calls.map(([event]) => event)).toEqual([
        { type: 'session.revoked', sessionId: 'other-session' },
        {
          type: 'user.sessions.revoked',
          userId: 'user-1',
          exceptSessionId: 'current-session',
        },
        { type: 'user.sessions.revoked', userId: 'user-1' },
        { type: 'user.sessions.revoked', userId: 'user-1' },
      ]);
    } finally {
      await server.close();
    }
  });
  it('challenges the eleventh failed attempt in a ten-minute window', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('REDIS_URL', undefined);
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-rate-limit-secret');
    const handler = vi
      .fn()
      .mockResolvedValue(new Response('invalid', { status: 401 }));
    const server = Fastify();
    mountBetterAuth(
      server,
      {
        apiOrigin: 'http://localhost:3001',
        auth: { handler },
        trustedWebOrigin: 'http://localhost:3000',
      } as unknown as BetterAuthService,
      new HttpRateLimiter(),
      { verify: vi.fn() } as unknown as TurnstileVerifier,
    );

    try {
      for (let index = 0; index < 10; index += 1) {
        expect((await signIn(server)).statusCode).toBe(401);
      }
      expect((await signIn(server)).statusCode).toBe(429);
      expect(handler).toHaveBeenCalledTimes(10);
    } finally {
      await server.close();
      vi.unstubAllEnvs();
    }
  });

  it('requires Turnstile after ten failures and permits a verified attempt', async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(new Response('invalid', { status: 401 }));
    const reserveIdentity = vi
      .fn()
      .mockResolvedValue({ retryAfterMs: 600_000 });
    const releaseIdentity = vi.fn();
    const verify = vi.fn().mockResolvedValue(undefined);
    const server = buildServer(
      handler,
      reserveIdentity,
      releaseIdentity,
      verify,
    );

    try {
      const challenge = await signIn(server);
      expect(challenge.statusCode).toBe(429);
      expect(challenge.json()).toMatchObject({
        code: 'AUTH_LOGIN_VERIFICATION_REQUIRED',
      });
      expect(handler).not.toHaveBeenCalled();

      const verified = await signIn(server, {
        'x-turnstile-token': 'human-token',
      });
      expect(verified.statusCode).toBe(401);
      expect(verify).toHaveBeenCalledWith('human-token', '198.51.100.5');
      expect(reserveIdentity).toHaveBeenCalledWith(
        'signInEmailFailures',
        'viewer@example.com',
      );
      expect(handler).toHaveBeenCalledTimes(1);
      expect(releaseIdentity).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('keeps failed attempts and releases successful sign-ins', async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(new Response('invalid', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const reserveIdentity = vi
      .fn()
      .mockResolvedValueOnce({ reservationId: 'failed-slot' })
      .mockResolvedValueOnce({ reservationId: 'successful-slot' });
    const releaseIdentity = vi.fn().mockResolvedValue(undefined);
    const server = buildServer(
      handler,
      reserveIdentity,
      releaseIdentity,
      vi.fn(),
    );

    try {
      expect((await signIn(server)).statusCode).toBe(401);
      expect((await signIn(server)).statusCode).toBe(200);
      expect(releaseIdentity).toHaveBeenCalledTimes(1);
      expect(releaseIdentity).toHaveBeenCalledWith(
        'signInEmailFailures',
        'viewer@example.com',
        'successful-slot',
      );
    } finally {
      await server.close();
    }
  });

  it('does not forward a failed Turnstile challenge to Better Auth', async () => {
    const handler = vi.fn();
    const verify = vi
      .fn()
      .mockRejectedValue(new HttpException('Human verification failed', 403));
    const server = buildServer(
      handler,
      vi.fn().mockResolvedValue({ retryAfterMs: 600_000 }),
      vi.fn(),
      verify,
    );

    try {
      const response = await signIn(server, {
        'x-turnstile-token': 'bad-token',
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'AUTH_TURNSTILE_FAILED' });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});

function buildServer(
  handler: ReturnType<typeof vi.fn>,
  reserveIdentity: ReturnType<typeof vi.fn>,
  releaseIdentity: ReturnType<typeof vi.fn>,
  verify: ReturnType<typeof vi.fn>,
) {
  const server = Fastify();
  mountBetterAuth(
    server,
    {
      apiOrigin: 'http://localhost:3001',
      auth: { handler },
      trustedWebOrigin: 'http://localhost:3000',
    } as unknown as BetterAuthService,
    { reserveIdentity, releaseIdentity } as unknown as HttpRateLimiter,
    { verify } as unknown as TurnstileVerifier,
  );
  return server;
}

function signIn(server: ReturnType<typeof Fastify>, headers = {}) {
  return server.inject({
    headers: { origin: 'http://localhost:3000', ...headers },
    method: 'POST',
    payload: { email: 'Viewer@Example.com', password: 'wrong-password' },
    remoteAddress: '198.51.100.5',
    url: '/api/v1/auth/sign-in/email',
  });
}
