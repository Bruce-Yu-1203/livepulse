import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { BetterAuthService } from './better-auth.service.js';
import { CsrfGuard } from './csrf.guard.js';

describe('CsrfGuard', () => {
  const guard = new CsrfGuard({
    trustedWebOrigin: 'http://localhost:3000',
  } as BetterAuthService);

  it('accepts the configured browser origin', () => {
    expect(guard.canActivate(context('http://localhost:3000'))).toBe(true);
  });

  it.each([undefined, 'https://attacker.example'])(
    'rejects a missing or untrusted origin: %s',
    (origin) => {
      expect(() => guard.canActivate(context(origin))).toThrow(HttpException);
    },
  );
});

function context(origin: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { origin } }),
    }),
  } as ExecutionContext;
}
