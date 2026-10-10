import { z } from 'zod';

const MessageTextSchema = z.string().trim().min(1).max(200);

export const RoomMessageSchema = z
  .object({
    acceptedAt: z.iso.datetime(),
    authorId: z.uuid(),
    clientMessageId: z.uuid(),
    messageId: z.uuid(),
    roomId: z.uuid(),
    text: MessageTextSchema,
  })
  .strict();

export type RoomMessage = z.infer<typeof RoomMessageSchema>;

export const ListRoomMessagesQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListRoomMessagesQuery = z.infer<typeof ListRoomMessagesQuerySchema>;

export const ListRoomMessagesResponseSchema = z
  .object({
    items: z.array(RoomMessageSchema),
    nextCursor: z.string().min(1).nullable(),
    requestId: z.string().min(1),
  })
  .strict();

export type ListRoomMessagesResponse = z.infer<
  typeof ListRoomMessagesResponseSchema
>;
