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

export function mountBetterAuth(
  fastify: FastifyInstance,
  authentication: BetterAuthService,
  rateLimiter: Pick<HttpRateLimiter, 'reserveIdentity' | 'releaseIdentity'>,
  turnstile: Pick<TurnstileVerifier, 'verify'>,
): void {
  fastify.route({
    handler: (request, reply) =>
      handleBetterAuthRequest(
        request,
        reply,
        authentication,
        rateLimiter,
        turnstile,
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
