import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import { AccessTokenGuard } from './access-token.guard.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { accessCookieName, AuthTokenService } from './auth-token.service.js';

const user = {
  createdAt: new Date('2026-10-09T01:00:00.000Z'),
  email: 'viewer@example.com',
  id: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
  role: 'VIEWER' as const,
};
const sessionId = '99d30467-ed47-43b8-96b0-d36ab2ee60e0';

describe('AccessTokenGuard', () => {
  const tokens = new AuthTokenService();
  const guard = new AccessTokenGuard(tokens);

  it('verifies the access cookie and attaches a minimal principal', async () => {
    const access = await tokens.createAccessCredentials(user, sessionId);
    const request = createRequest({ [accessCookieName]: access.token });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect((request as AuthenticatedRequest).auth).toEqual({
      role: 'VIEWER',
      sessionId,
      userId: user.id,
    });
  });

  it.each([undefined, 'tampered.jwt.value'])(
    'rejects a missing or invalid access cookie',
    async (token) => {
      const request = createRequest(token ? { [accessCookieName]: token } : {});

      try {
        await guard.canActivate(createContext(request));
        throw new Error('Expected the guard to reject the request');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(401);
      }
    },
  );
});

function createRequest(cookies: Record<string, string>): FastifyRequest {
  return { cookies } as unknown as FastifyRequest;
}

function createContext(request: FastifyRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
