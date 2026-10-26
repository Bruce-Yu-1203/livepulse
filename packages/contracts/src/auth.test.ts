import { describe, expect, it } from 'vitest';

import {
  ApiErrorCode,
  AvatarUploadRequestSchema,
  AvatarUploadResponseSchema,
  ApiErrorResponseSchema,
  AuthProvidersResponseSchema,
  CurrentUserResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  RegistrationCompleteRequestSchema,
  RegistrationEmailSchema,
  RegistrationPasswordSchema,
  RegistrationStartResponseSchema,
  RegistrationUsernameSchema,
  SocialSignInResponseSchema,
} from './auth.js';

describe('RegisterRequestSchema', () => {
  it('normalizes the email and username while preserving the password', () => {
    expect(
      RegisterRequestSchema.parse({
        email: '  Viewer@Example.COM ',
        username: '  Viewer_123 ',
        password: 'securepass123',
        turnstileToken: '  valid-turnstile-token  ',
      }),
    ).toEqual({
      email: 'viewer@example.com',
      username: 'viewer_123',
      password: 'securepass123',
      turnstileToken: 'valid-turnstile-token',
    });
  });

  it.each([
    {
      email: 'not-an-email',
      username: 'viewer1',
      password: 'securepass123',
      turnstileToken: 'token',
    },
    {
      email: 'viewer@example.com',
      username: 'abcd',
      password: 'securepass123',
      turnstileToken: 'token',
    },
    {
      email: 'viewer@example.com',
      username: 'viewer1',
      password: 'letters',
      turnstileToken: 'token',
    },
    {
      email: 'viewer@example.com',
      username: 'viewer1',
      password: '12345678',
      turnstileToken: 'token',
    },
    {
      email: 'viewer@example.com',
      username: 'viewer1',
      password: 'short1',
      turnstileToken: 'token',
    },
    {
      email: 'viewer@example.com',
      username: 'viewer1',
      password: 'securepass123',
    },
    {
      email: 'viewer@example.com',
      username: 'viewer1',
      password: 'securepass123',
      turnstileToken: '',
    },
    {
      email: 'viewer@example.com',
      username: 'viewer1',
      password: 'securepass123',
      turnstileToken: 'token',
      role: 'ADMIN',
    },
  ])('rejects invalid or unknown registration input: %o', (input) => {
    expect(RegisterRequestSchema.safeParse(input).success).toBe(false);
  });

  it('defines each registration step', () => {
    expect(RegistrationEmailSchema.safeParse('wrong-address').success).toBe(
      false,
    );
    expect(RegistrationUsernameSchema.safeParse('A_good_name').success).toBe(
      true,
    );
    expect(RegistrationPasswordSchema.safeParse('letters123').success).toBe(
      true,
    );
    expect(
      RegistrationCompleteRequestSchema.parse({
        email: 'VIEWER@example.com',
        code: '123456',
      }),
    ).toEqual({ email: 'viewer@example.com', code: '123456' });
    expect(
      RegistrationStartResponseSchema.parse({
        expiresInSeconds: 600,
        resendAfterSeconds: 60,
        requestId: 'request-1',
      }).resendAfterSeconds,
    ).toBe(60);
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

  it('accepts enabled providers and social authorization responses', () => {
    expect(
      AuthProvidersResponseSchema.parse({ providers: ['google'] }),
    ).toEqual({ providers: ['google'] });
    expect(
      SocialSignInResponseSchema.parse({
        redirect: false,
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
      }).url,
    ).toContain('accounts.google.com');
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
    expect(ApiErrorCode.RequestRateLimited).toBe('REQUEST_RATE_LIMITED');
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
          username: null,
          avatarUrl:
            'https://api.livepulse.tech/api/v1/users/295d5bd9-d9da-44b2-8f5d-8839f13a4437/avatar?v=1',
        },
      }).user.role,
    ).toBe('HOST');
  });

  it('accepts an avatar upload and rejects unexpected fields', () => {
    expect(
      AvatarUploadRequestSchema.parse({
        contentType: 'image/png',
        data: 'aGVsbG8=',
      }).contentType,
    ).toBe('image/png');
    expect(
      AvatarUploadRequestSchema.safeParse({
        contentType: 'image/svg+xml',
        data: 'aGVsbG8=',
      }).success,
    ).toBe(false);
    expect(
      AvatarUploadResponseSchema.parse({
        avatarUrl: 'https://api.livepulse.tech/api/v1/users/id/avatar',
        requestId: 'request-7',
      }).requestId,
    ).toBe('request-7');
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
