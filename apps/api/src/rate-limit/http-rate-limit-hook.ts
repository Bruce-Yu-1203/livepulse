import { isIP } from 'node:net';

import { ApiErrorCode } from '@livepulse/contracts';
import type { FastifyInstance } from 'fastify';

import type {
  HttpRateLimitPolicy,
  HttpRateLimiter,
} from './http-rate-limiter.js';

export function httpRateLimitPolicyForRequest(
  method: string,
  url: string,
): HttpRateLimitPolicy | undefined {
  if (method !== 'POST') return undefined;

  const path = new URL(url, 'http://localhost').pathname.replace(/\/+$/u, '');
  if (path === '/api/v1/auth/registration/start') return 'registrationStart';
  if (path === '/api/v1/auth/registration/complete')
    return 'registrationComplete';
  if (path.startsWith('/api/v1/auth/sign-in/') && path.length > 21)
    return 'signIn';
  if (path === '/api/v1/users/me/avatar') return 'avatarUpload';
  if (path === '/api/v1/reports') return 'reportCreate';
  return undefined;
}

export function resolveTrustedProxyCidrs(
  value: string | undefined,
): false | string {
  if (!value?.trim()) return false;

  const entries = value.split(',').map((entry) => entry.trim());
  for (const entry of entries) {
    const [address, prefix, extra] = entry.split('/');
    const family = isIP(address ?? '');
    const maximumPrefix = family === 4 ? 32 : 128;
    if (
      !family ||
      extra !== undefined ||
      (prefix !== undefined &&
        (!/^\d+$/u.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > maximumPrefix))
    ) {
      throw new Error('HTTP_TRUST_PROXY_CIDRS must list trusted IPs or CIDRs');
    }
  }
  return entries.join(', ');
}

export function registerHttpRateLimitHook(
  fastify: FastifyInstance,
  limiter: Pick<HttpRateLimiter, 'consume'>,
): void {
  fastify.addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
    const policy = httpRateLimitPolicyForRequest(request.method, request.url);
    if (!policy) return;

    let retryAfterMs: number | undefined;
    try {
      retryAfterMs = await limiter.consume(policy, request.ip);
    } catch {
      return reply.status(503).send({
        code: ApiErrorCode.ServiceUnavailable,
        message: 'The service is temporarily unavailable',
        requestId: request.id,
      });
    }

    if (retryAfterMs !== undefined) {
      return reply
        .header('Retry-After', String(Math.ceil(retryAfterMs / 1_000)))
        .status(429)
        .send({
          code: ApiErrorCode.RequestRateLimited,
          message: 'Too many requests. Please try again later.',
          requestId: request.id,
          retryAfterMs,
        });
    }
  });
}
