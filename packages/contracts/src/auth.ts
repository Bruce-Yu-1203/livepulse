import { z } from 'zod';

import { UserRoleSchema } from './roles-and-rooms.js';

export const RegisterRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    password: z.string().min(12).max(128),
  })
  .strict();

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = RegisterRequestSchema;

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

const PublicUserSchema = z
  .object({
    createdAt: z.iso.datetime(),
    email: z.string().email().max(320),
    id: z.uuid(),
    role: UserRoleSchema,
  })
  .strict();

export const CsrfResponseSchema = z
  .object({
    requestId: z.string().min(1),
  })
  .strict();

export type CsrfResponse = z.infer<typeof CsrfResponseSchema>;

export const CurrentUserResponseSchema = z
  .object({
    requestId: z.string().min(1),
    user: PublicUserSchema,
  })
  .strict();

export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;

export const RegisterResponseSchema = z
  .object({
    requestId: z.string().min(1),
    user: z
      .object({
        createdAt: z.iso.datetime(),
        email: z.string().email().max(320),
        id: z.uuid(),
        role: UserRoleSchema.extract(['VIEWER']),
      })
      .strict(),
  })
  .strict();

export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const LoginResponseSchema = z
  .object({
    accessTokenExpiresAt: z.iso.datetime(),
    refreshTokenExpiresAt: z.iso.datetime(),
    requestId: z.string().min(1),
    user: PublicUserSchema,
  })
  .strict();

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshResponseSchema = z
  .object({
    accessTokenExpiresAt: z.iso.datetime(),
    refreshTokenExpiresAt: z.iso.datetime(),
    requestId: z.string().min(1),
  })
  .strict();

export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const ApiErrorCode = {
  CsrfValidationFailed: 'AUTH_CSRF_VALIDATION_FAILED',
  EmailAlreadyExists: 'AUTH_EMAIL_ALREADY_REGISTERED',
  InvalidCredentials: 'AUTH_INVALID_CREDENTIALS',
  InvalidSession: 'AUTH_INVALID_SESSION',
  InternalError: 'INTERNAL_ERROR',
  NotFound: 'RESOURCE_NOT_FOUND',
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
