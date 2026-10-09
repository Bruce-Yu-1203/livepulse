import { z } from 'zod';

import { RoomStatusSchema } from './roles-and-rooms.js';

const HttpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .refine((value) => isHttpUrl(value), {
    message: 'The URL must use HTTP or HTTPS',
  });

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export const CreateRoomRequestSchema = z
  .object({
    coverImageUrl: HttpUrlSchema,
    demoVideoUrl: HttpUrlSchema,
    description: z.string().trim().min(1).max(2_000),
    title: z.string().trim().min(1).max(120),
  })
  .strict();

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const RoomSchema = z
  .object({
    coverImageUrl: HttpUrlSchema,
    createdAt: z.iso.datetime(),
    demoVideoUrl: HttpUrlSchema,
    description: z.string().min(1).max(2_000),
    hostId: z.uuid(),
    id: z.uuid(),
    status: RoomStatusSchema,
    title: z.string().min(1).max(120),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export type Room = z.infer<typeof RoomSchema>;

export const CreateRoomResponseSchema = z
  .object({
    requestId: z.string().min(1),
    room: RoomSchema.extend({ status: z.literal('DRAFT') }),
  })
  .strict();

export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;
