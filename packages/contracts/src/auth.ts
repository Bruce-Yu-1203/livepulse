import { z } from 'zod';

import { UserRoleSchema } from './roles-and-rooms.js';

export const RegisterRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    password: z.string().min(12).max(128),
  })
  .strict();

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

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

export const ApiErrorCode = {
  EmailAlreadyExists: 'AUTH_EMAIL_ALREADY_REGISTERED',
  InternalError: 'INTERNAL_ERROR',
  NotFound: 'RESOURCE_NOT_FOUND',
  ServiceUnavailable: 'SERVICE_UNAVAILABLE',
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
