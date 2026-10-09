import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import {
  anonymousCsrfContext,
  AuthTokenService,
  csrfCookieName,
  refreshCookieName,
} from './auth-token.service.js';
import { csrfHeaderName, CsrfGuard } from './csrf.guard.js';

describe('CsrfGuard', () => {
  const tokens = new AuthTokenService();
  const guard = new CsrfGuard(tokens);

  it('accepts a signed anonymous token from the trusted origin', () => {
    const token = tokens.createCsrfToken(anonymousCsrfContext);
    const request = createRequest(token);

    expect(guard.canActivate(createContext(request))).toBe(true);
  });

  it('accepts a token bound to the refresh session', () => {
    const refresh = tokens.createRefreshCredentials();
    const token = tokens.createCsrfToken(refresh.sessionId);
    const request = createRequest(token, {
      [refreshCookieName]: refresh.token,
    });

    expect(guard.canActivate(createContext(request))).toBe(true);
  });

  it.each([
    { header: 'different', origin: 'http://localhost:3000' },
    { header: null, origin: 'http://localhost:3000' },
    { header: 'cookie', origin: 'https://attacker.example' },
  ])(
    'rejects mismatched tokens or an untrusted origin',
    ({ header, origin }) => {
      const token = tokens.createCsrfToken(anonymousCsrfContext);
      const request = createRequest(
        token,
        {},
        header === 'cookie' ? token : header,
        origin,
      );

      expect(() => guard.canActivate(createContext(request))).toThrow(
        HttpException,
      );
    },
  );
});

function createRequest(
  cookieToken: string,
  additionalCookies: Record<string, string> = {},
  headerToken: null | string = cookieToken,
  origin = 'http://localhost:3000',
): FastifyRequest {
  return {
    cookies: { ...additionalCookies, [csrfCookieName]: cookieToken },
    headers: {
      [csrfHeaderName]: headerToken ?? undefined,
      origin,
    },
  } as unknown as FastifyRequest;
}

function createContext(request: FastifyRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
