import { describe, expect, it } from 'vitest';

import {
  ApiErrorCode,
  ApiErrorResponseSchema,
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
