import { HttpException } from '@nestjs/common';
import { ApiErrorCode, RegistrationEmailSchema } from '@livepulse/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { getHttpClientIp } from '../rate-limit/http-client-ip.js';
import type { HttpRateLimiter } from '../rate-limit/http-rate-limiter.js';
import {
  betterAuthBasePath,
  BetterAuthService,
} from './better-auth.service.js';
import type { TurnstileVerifier } from './turnstile-verifier.js';
import type {
  RealtimeControl,
  RealtimeControlEvent,
} from '../realtime/realtime-coordination.js';
import type { AuthenticatedPrincipal } from './authenticated-request.js';

export function mountBetterAuth(
  fastify: FastifyInstance,
  authentication: BetterAuthService,
  rateLimiter: Pick<HttpRateLimiter, 'reserveIdentity' | 'releaseIdentity'>,
  turnstile: Pick<TurnstileVerifier, 'verify'>,
  control?: RealtimeControl,
): void {
  fastify.route({
    handler: (request, reply) =>
      handleBetterAuthRequest(
        request,
        reply,
        authentication,
        rateLimiter,
        turnstile,
        control,
      ),
    method: ['GET', 'POST'],
    url: `${betterAuthBasePath}/*`,
  });
}

async function handleBetterAuthRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  authentication: BetterAuthService,
  rateLimiter: Pick<HttpRateLimiter, 'reserveIdentity' | 'releaseIdentity'>,
  turnstile: Pick<TurnstileVerifier, 'verify'>,
  control?: RealtimeControl,
): Promise<void> {
  if (
    request.method === 'POST' &&
    request.headers.origin !== authentication.trustedWebOrigin
  ) {
    void reply.status(403).send({
      code: 'INVALID_ORIGIN',
      message: 'Request origin is not allowed',
    });
    return;
  }

  const email = signInEmail(request);
  let reservationId: string | undefined;
  if (email) {
    let reservation: Awaited<ReturnType<HttpRateLimiter['reserveIdentity']>>;
    try {
      reservation = await rateLimiter.reserveIdentity(
        'signInEmailFailures',
        email,
      );
    } catch {
      sendApiError(
        reply,
        request,
        503,
        ApiErrorCode.ServiceUnavailable,
        'The service is temporarily unavailable',
      );
      return;
    }
    if ('retryAfterMs' in reservation) {
      const token = request.headers['x-turnstile-token'];
      if (typeof token !== 'string' || !token.trim() || token.length > 2_048) {
        sendApiError(
          reply,
          request,
          429,
          ApiErrorCode.LoginVerificationRequired,
          'Complete human verification to continue signing in.',
        );
        return;
      }
      try {
        await turnstile.verify(token, getHttpClientIp(request));
      } catch (error) {
        const status = error instanceof HttpException ? error.getStatus() : 503;
        sendApiError(
          reply,
          request,
          status,
          status === 403
            ? ApiErrorCode.TurnstileFailed
            : ApiErrorCode.ServiceUnavailable,
          status === 403
            ? 'Human verification failed. Please try again.'
            : 'Human verification is temporarily unavailable.',
        );
        return;
      }
    } else {
      reservationId = reservation.reservationId;
    }
  }

  const headers = fromNodeHeaders(request.headers);
  headers.delete('content-length');
  headers.delete('x-turnstile-token');
  if (request.method === 'POST' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  let revocation:
    { event: RealtimeControlEvent; verifyGone?: string } | undefined;
  if (control) {
    try {
      revocation = await revocationForRequest(request, authentication, headers);
    } catch (error) {
      request.log.error(error, 'Could not prepare session revocation notice');
    }
  }

  let response: Response;
  try {
    response = await authentication.auth.handler(
      new Request(new URL(request.url, authentication.apiOrigin), {
        ...(request.method === 'GET'
          ? {}
          : { body: JSON.stringify(request.body ?? {}) }),
        headers,
        method: request.method,
      }),
    );
  } catch (error) {
    if (email && reservationId) {
      await releaseLoginReservation(rateLimiter, email, reservationId, request);
    }
    throw error;
  }

  if (email && reservationId && response.status !== 401) {
    await releaseLoginReservation(rateLimiter, email, reservationId, request);
  }

  if (control && revocation && response.ok) {
    try {
      if (
        !revocation.verifyGone ||
        !(await authentication.sessionExists(revocation.verifyGone))
      ) {
        await control.publishControl(revocation.event);
      }
    } catch (error) {
      request.log.error(error, 'Could not publish session revocation notice');
    }
  }

  for (const [name, value] of response.headers.entries()) {
    if (name !== 'set-cookie') {
      void reply.header(name, value);
    }
  }

  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) {
    void reply.header('set-cookie', setCookies);
  }

  void reply.status(response.status).send(await response.text());
}

async function revocationForRequest(
  request: FastifyRequest,
  authentication: BetterAuthService,
  headers: Headers,
): Promise<{ event: RealtimeControlEvent; verifyGone?: string } | undefined> {
  if (request.method !== 'POST') return undefined;
  const path = new URL(request.url, authentication.apiOrigin).pathname;
  const routes = new Set([
    `${betterAuthBasePath}/sign-out`,
    `${betterAuthBasePath}/revoke-session`,
    `${betterAuthBasePath}/revoke-sessions`,
    `${betterAuthBasePath}/revoke-other-sessions`,
    `${betterAuthBasePath}/change-password`,
  ]);
  if (!routes.has(path)) return undefined;

  const principal = (await authentication.sessionPrincipalFromHeaders(headers))
    ?.principal;
  if (!principal) return undefined;
  return revocationForPath(path, request.body, principal, authentication);
}

async function revocationForPath(
  path: string,
  body: unknown,
  principal: AuthenticatedPrincipal,
  authentication: BetterAuthService,
): Promise<{ event: RealtimeControlEvent; verifyGone?: string } | undefined> {
  if (path === `${betterAuthBasePath}/sign-out`) {
    return {
      event: { type: 'session.revoked', sessionId: principal.sessionId },
      verifyGone: principal.sessionId,
    };
  }
  if (path === `${betterAuthBasePath}/revoke-session`) {
    const token = readBodyString(body, 'token');
    if (!token) return undefined;
    const target = await authentication.sessionByToken(token);
    return target?.userId === principal.userId
      ? {
          event: { type: 'session.revoked', sessionId: target.id },
          verifyGone: target.id,
        }
      : undefined;
  }
  if (path === `${betterAuthBasePath}/revoke-other-sessions`) {
    return {
      event: {
        type: 'user.sessions.revoked',
        userId: principal.userId,
        exceptSessionId: principal.sessionId,
      },
    };
  }
  if (
    path === `${betterAuthBasePath}/revoke-sessions` ||
    (path === `${betterAuthBasePath}/change-password` &&
      readBodyBoolean(body, 'revokeOtherSessions'))
  ) {
    return {
      event: { type: 'user.sessions.revoked', userId: principal.userId },
    };
  }
  return undefined;
}

function readBodyString(body: unknown, name: string): string | undefined {
  return typeof body === 'object' &&
    body !== null &&
    name in body &&
    typeof body[name as keyof typeof body] === 'string'
    ? (body[name as keyof typeof body] as string)
    : undefined;
}

function readBodyBoolean(body: unknown, name: string): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    name in body &&
    body[name as keyof typeof body] === true
  );
}

function signInEmail(request: FastifyRequest): string | undefined {
  if (
    request.method !== 'POST' ||
    new URL(request.url, 'http://localhost').pathname !==
      `${betterAuthBasePath}/sign-in/email` ||
    typeof request.body !== 'object' ||
    request.body === null ||
    !('email' in request.body) ||
    !('password' in request.body) ||
    typeof request.body.password !== 'string'
  ) {
    return undefined;
  }
  const parsed = RegistrationEmailSchema.safeParse(request.body.email);
  return parsed.success ? parsed.data : undefined;
}

async function releaseLoginReservation(
  rateLimiter: Pick<HttpRateLimiter, 'releaseIdentity'>,
  email: string,
  reservationId: string,
  request: FastifyRequest,
): Promise<void> {
  try {
    await rateLimiter.releaseIdentity(
      'signInEmailFailures',
      email,
      reservationId,
    );
  } catch (error) {
    request.log.error(error, 'Could not release login failure reservation');
  }
}

function sendApiError(
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: (typeof ApiErrorCode)[keyof typeof ApiErrorCode],
  message: string,
): void {
  void reply.status(status).send({ code, message, requestId: request.id });
}
