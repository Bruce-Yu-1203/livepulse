import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  betterAuthBasePath,
  BetterAuthService,
} from './better-auth.service.js';

export function mountBetterAuth(
  fastify: FastifyInstance,
  authentication: BetterAuthService,
): void {
  fastify.route({
    handler: (request, reply) =>
      handleBetterAuthRequest(request, reply, authentication),
    method: ['GET', 'POST'],
    url: `${betterAuthBasePath}/*`,
  });
}

async function handleBetterAuthRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  authentication: BetterAuthService,
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

  const headers = fromNodeHeaders(request.headers);
  headers.delete('content-length');
  if (request.method === 'POST' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await authentication.auth.handler(
    new Request(new URL(request.url, authentication.apiOrigin), {
      ...(request.method === 'GET'
        ? {}
        : { body: JSON.stringify(request.body ?? {}) }),
      headers,
      method: request.method,
    }),
  );

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
