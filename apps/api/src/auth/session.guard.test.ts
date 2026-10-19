import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from './authenticated-request.js';
import type { BetterAuthService } from './better-auth.service.js';
import { SessionGuard } from './session.guard.js';

describe('SessionGuard', () => {
  it('attaches the Better Auth principal to the request', async () => {
    const principal = {
      role: 'VIEWER' as const,
      sessionId: 'session-id',
      userId: 'user-id',
    };
    const authentication = {
      principalFromHeaders: vi.fn().mockResolvedValue(principal),
    } as unknown as BetterAuthService;
    const { context, request } = requestContext();

    await expect(
      new SessionGuard(authentication).canActivate(context),
    ).resolves.toBe(true);
    expect((request as AuthenticatedRequest).auth).toEqual(principal);
  });

  it('rejects missing and invalid sessions uniformly', async () => {
    for (const result of [undefined, new Error('invalid session')]) {
      const authentication = {
        principalFromHeaders:
          result instanceof Error
            ? vi.fn().mockRejectedValue(result)
            : vi.fn().mockResolvedValue(result),
      } as unknown as BetterAuthService;

      await expect(
        new SessionGuard(authentication).canActivate(requestContext().context),
      ).rejects.toBeInstanceOf(HttpException);
    }
  });
});

function requestContext(): {
  context: ExecutionContext;
  request: { headers: Record<string, string> };
} {
  const request = { headers: { cookie: 'livepulse.session_token=value' } };

  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext,
    request,
  };
}
