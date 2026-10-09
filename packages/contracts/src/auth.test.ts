import { describe, expect, it } from 'vitest';

import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  CsrfResponseSchema,
  CurrentUserResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
} from './auth.js';

describe('RegisterRequestSchema', () => {
  it('normalizes an email address while preserving the password', () => {
    expect(
      RegisterRequestSchema.parse({
        email: '  Viewer@Example.COM ',
        password: 'correct horse battery staple',
      }),
    ).toEqual({
      email: 'viewer@example.com',
      password: 'correct horse battery staple',
    });
  });

  it.each([
    { email: 'not-an-email', password: 'long-enough-password' },
    { email: 'viewer@example.com', password: 'short' },
    {
      email: 'viewer@example.com',
      password: 'long-enough-password',
      role: 'ADMIN',
    },
  ])('rejects invalid or unknown registration input: %o', (input) => {
    expect(RegisterRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe('login and session contracts', () => {
  it('normalizes login email and rejects additional fields', () => {
    expect(
      LoginRequestSchema.parse({
        email: ' Viewer@Example.COM ',
        password: 'correct horse battery staple',
      }),
    ).toEqual({
      email: 'viewer@example.com',
      password: 'correct horse battery staple',
    });
    expect(
      LoginRequestSchema.safeParse({
        email: 'viewer@example.com',
        password: 'correct horse battery staple',
        role: 'ADMIN',
      }).success,
    ).toBe(false);
  });

  it('accepts responses without exposing either token', () => {
    const expiration = '2026-10-09T01:15:00.000Z';
    const user = {
      createdAt: '2026-10-09T01:00:00.000Z',
      email: 'viewer@example.com',
      id: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
      role: 'VIEWER' as const,
    };

    expect(
      LoginResponseSchema.parse({
        accessTokenExpiresAt: expiration,
        refreshTokenExpiresAt: expiration,
        requestId: 'request-3',
        user,
      }).user,
    ).toEqual(user);
    expect(
      RefreshResponseSchema.parse({
        accessTokenExpiresAt: expiration,
        refreshTokenExpiresAt: expiration,
        requestId: 'request-4',
      }).requestId,
    ).toBe('request-4');
  });

  it('defines stable authentication errors', () => {
    expect(ApiErrorCode.CsrfValidationFailed).toBe(
      'AUTH_CSRF_VALIDATION_FAILED',
    );
    expect(ApiErrorCode.InvalidCredentials).toBe('AUTH_INVALID_CREDENTIALS');
    expect(ApiErrorCode.InvalidSession).toBe('AUTH_INVALID_SESSION');
    expect(ApiErrorCode.Unauthorized).toBe('AUTH_UNAUTHORIZED');
  });

  it('accepts CSRF bootstrap and current-user responses', () => {
    expect(CsrfResponseSchema.parse({ requestId: 'request-5' })).toEqual({
      requestId: 'request-5',
    });
    expect(
      CurrentUserResponseSchema.parse({
        requestId: 'request-6',
        user: {
          createdAt: '2026-10-09T01:00:00.000Z',
          email: 'host@example.com',
          id: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
          role: 'HOST',
        },
      }).user.role,
    ).toBe('HOST');
  });
});

describe('registration responses', () => {
  it('accepts a public user response without sensitive fields', () => {
    const response = {
      requestId: 'request-1',
      user: {
        createdAt: '2026-10-09T01:00:00.000Z',
        email: 'viewer@example.com',
        id: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
        role: 'VIEWER',
      },
    };

    expect(RegisterResponseSchema.parse(response)).toEqual(response);
  });

  it('defines a stable duplicate-email error', () => {
    expect(
      ApiErrorResponseSchema.parse({
        code: ApiErrorCode.EmailAlreadyExists,
        message: 'An account with this email already exists',
        requestId: 'request-2',
      }).code,
    ).toBe('AUTH_EMAIL_ALREADY_REGISTERED');
  });
});
