import { z } from 'zod';

import { UserRoleSchema } from './roles-and-rooms.js';

export const RegistrationEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(320);
export const RegistrationUsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5)
  .max(30)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Use letters, numbers, and underscores; start with a letter',
  );
export const RegistrationPasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/i, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

export const RegisterRequestSchema = z
  .object({
    email: RegistrationEmailSchema,
    username: RegistrationUsernameSchema,
    password: RegistrationPasswordSchema,
  })
  .strict();

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z
  .object({
    email: RegistrationEmailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegistrationCompleteRequestSchema = z
  .object({
    email: RegistrationEmailSchema,
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

export const RegistrationStartResponseSchema = z
  .object({
    expiresInSeconds: z.number().int().positive(),
    resendAfterSeconds: z.number().int().positive(),
    requestId: z.string().min(1),
  })
  .strict();

export const RegistrationCompleteResponseSchema = z
  .object({
    requestId: z.string().min(1),
    userId: z.uuid(),
  })
  .strict();

export type RegistrationStartResponse = z.infer<
  typeof RegistrationStartResponseSchema
>;
export type RegistrationCompleteResponse = z.infer<
  typeof RegistrationCompleteResponseSchema
>;

const PublicUserSchema = z
  .object({
    createdAt: z.iso.datetime(),
    email: z.string().email().max(320),
    id: z.uuid(),
    role: UserRoleSchema,
    username: RegistrationUsernameSchema.nullable(),
  })
  .strict();

export const CurrentUserResponseSchema = z
  .object({
    requestId: z.string().min(1),
    user: PublicUserSchema,
  })
  .strict();

export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;

export const RegisterResponseSchema = z
  .object({
    token: z.string().min(1),
    user: z
      .object({
        createdAt: z.iso.datetime(),
        email: z.string().email().max(320),
        emailVerified: z.boolean(),
        id: z.uuid(),
        image: z.string().url().nullable().optional(),
        name: z.string().min(1).max(120),
        role: UserRoleSchema.extract(['VIEWER']),
        updatedAt: z.iso.datetime(),
      })
      .strict(),
  })
  .strict();

export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const LoginResponseSchema = z
  .object({
    redirect: z.boolean(),
    token: z.string().min(1),
    user: z
      .object({
        createdAt: z.iso.datetime(),
        email: z.string().email().max(320),
        emailVerified: z.boolean(),
        id: z.uuid(),
        image: z.string().url().nullable().optional(),
        name: z.string().min(1).max(120),
        role: UserRoleSchema,
        updatedAt: z.iso.datetime(),
      })
      .strict(),
  })
  .strict();

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const AuthProvidersResponseSchema = z
  .object({
    providers: z.array(z.enum(['google'])),
  })
  .strict();

export type AuthProvidersResponse = z.infer<typeof AuthProvidersResponseSchema>;

export const SocialSignInResponseSchema = z
  .object({
    redirect: z.boolean(),
    url: z.string().url(),
  })
  .strict();

export type SocialSignInResponse = z.infer<typeof SocialSignInResponseSchema>;

export const ApiErrorCode = {
  CsrfValidationFailed: 'AUTH_CSRF_VALIDATION_FAILED',
  EmailAlreadyExists: 'AUTH_EMAIL_ALREADY_REGISTERED',
  RegistrationCodeInvalid: 'AUTH_REGISTRATION_CODE_INVALID',
  RegistrationRateLimited: 'AUTH_REGISTRATION_RATE_LIMITED',
  UsernameAlreadyExists: 'AUTH_USERNAME_ALREADY_REGISTERED',
  Forbidden: 'AUTH_FORBIDDEN',
  InvalidCredentials: 'AUTH_INVALID_CREDENTIALS',
  InvalidSession: 'AUTH_INVALID_SESSION',
  InternalError: 'INTERNAL_ERROR',
  NotFound: 'RESOURCE_NOT_FOUND',
  ReportAlreadyActioned: 'REPORT_ALREADY_ACTIONED',
  RoomInvalidTransition: 'ROOM_INVALID_STATUS_TRANSITION',
  RoomVersionConflict: 'ROOM_VERSION_CONFLICT',
  RealtimeAuthenticationRequired: 'REALTIME_AUTHENTICATION_REQUIRED',
  RealtimeContentBlocked: 'REALTIME_CONTENT_BLOCKED',
  RealtimeInvalidEvent: 'REALTIME_INVALID_EVENT',
  RealtimeMessageConflict: 'REALTIME_MESSAGE_CONFLICT',
  RealtimeMuted: 'REALTIME_MUTED',
  RealtimeNotJoined: 'REALTIME_NOT_JOINED',
  RealtimeRateLimited: 'REALTIME_RATE_LIMITED',
  RealtimeRoomNotLive: 'REALTIME_ROOM_NOT_LIVE',
  ServiceUnavailable: 'SERVICE_UNAVAILABLE',
  Unauthorized: 'AUTH_UNAUTHORIZED',
  ValidationError: 'REQUEST_VALIDATION_FAILED',
} as const;

export const ApiErrorResponseSchema = z
  .object({
    code: z.enum(ApiErrorCode),
    message: z.string().min(1),
    requestId: z.string().min(1),
    retryAfterMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
