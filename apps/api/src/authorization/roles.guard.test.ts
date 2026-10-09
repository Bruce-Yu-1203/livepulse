import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRole } from './allowed-roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  it.each<AuthenticatedRole>(['HOST', 'ADMIN'])(
    'allows the %s role when it is explicitly listed',
    (role) => {
      const guard = new RolesGuard(createReflector(['HOST', 'ADMIN']));

      expect(guard.canActivate(createContext(role))).toBe(true);
    },
  );

  it('rejects an authenticated viewer with a stable forbidden error', () => {
    const guard = new RolesGuard(createReflector(['HOST', 'ADMIN']));

    try {
      guard.canActivate(createContext('VIEWER'));
      throw new Error('Expected the guard to reject the request');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(403);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'AUTH_FORBIDDEN',
      });
    }
  });

  it('allows routes without role metadata', () => {
    const guard = new RolesGuard(createReflector(undefined));

    expect(guard.canActivate(createContext('VIEWER'))).toBe(true);
  });
});

function createReflector(
  roles: readonly AuthenticatedRole[] | undefined,
): Reflector {
  return {
    getAllAndOverride: vi.fn().mockReturnValue(roles),
  } as unknown as Reflector;
}

function createContext(role: AuthenticatedRole): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ auth: { role } }),
    }),
  } as unknown as ExecutionContext;
}
