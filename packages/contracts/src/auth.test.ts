import { describe, expect, it } from 'vitest';

import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  CurrentUserResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
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

  it('accepts Better Auth sign-in responses', () => {
    const user = {
      createdAt: '2026-10-09T01:00:00.000Z',
      email: 'viewer@example.com',
      id: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
      role: 'VIEWER' as const,
    };

    expect(
      LoginResponseSchema.parse({
        redirect: false,
        token: 'opaque-session-token',
        user: {
          ...user,
          emailVerified: false,
          name: 'Viewer',
          updatedAt: '2026-10-09T01:00:00.000Z',
        },
      }).user,
    ).toMatchObject(user);
  });

  it('defines stable authentication errors', () => {
    expect(ApiErrorCode.CsrfValidationFailed).toBe(
      'AUTH_CSRF_VALIDATION_FAILED',
    );
    expect(ApiErrorCode.Forbidden).toBe('AUTH_FORBIDDEN');
    expect(ApiErrorCode.InvalidCredentials).toBe('AUTH_INVALID_CREDENTIALS');
    expect(ApiErrorCode.InvalidSession).toBe('AUTH_INVALID_SESSION');
    expect(ApiErrorCode.ReportAlreadyActioned).toBe('REPORT_ALREADY_ACTIONED');
    expect(ApiErrorCode.RoomInvalidTransition).toBe(
      'ROOM_INVALID_STATUS_TRANSITION',
    );
    expect(ApiErrorCode.RoomVersionConflict).toBe('ROOM_VERSION_CONFLICT');
    expect(ApiErrorCode.RealtimeAuthenticationRequired).toBe(
      'REALTIME_AUTHENTICATION_REQUIRED',
    );
    expect(ApiErrorCode.RealtimeContentBlocked).toBe(
      'REALTIME_CONTENT_BLOCKED',
    );
    expect(ApiErrorCode.RealtimeRateLimited).toBe('REALTIME_RATE_LIMITED');
    expect(ApiErrorCode.Unauthorized).toBe('AUTH_UNAUTHORIZED');
  });

  it('accepts current-user responses', () => {
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
      token: 'opaque-session-token',
      user: {
        createdAt: '2026-10-09T01:00:00.000Z',
        email: 'viewer@example.com',
        emailVerified: false,
        id: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
        name: 'Viewer',
        role: 'VIEWER',
        updatedAt: '2026-10-09T01:00:00.000Z',
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
