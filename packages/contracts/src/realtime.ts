import { z } from 'zod';

import { ApiErrorCode } from './auth.js';

const EventVersionSchema = z.literal(1);
const RequestIdSchema = z.uuid();
const RoomIdSchema = z.uuid();
const ClientMessageIdSchema = z.uuid();
const MessageIdSchema = z.uuid();
const MessageTextSchema = z.string().trim().min(1).max(200);

export const RoomJoinEventSchema = z
  .object({
    payload: z.object({ roomId: RoomIdSchema }).strict(),
    requestId: RequestIdSchema,
    type: z.literal('room.join'),
    v: EventVersionSchema,
  })
  .strict();

export const MessageSendEventSchema = z
  .object({
    payload: z
      .object({
        clientMessageId: ClientMessageIdSchema,
        roomId: RoomIdSchema,
        text: MessageTextSchema,
      })
      .strict(),
    requestId: RequestIdSchema,
    type: z.literal('message.send'),
    v: EventVersionSchema,
  })
  .strict();

export const ClientRealtimeEventSchema = z.discriminatedUnion('type', [
  RoomJoinEventSchema,
  MessageSendEventSchema,
]);

export type ClientRealtimeEvent = z.infer<typeof ClientRealtimeEventSchema>;

export const RoomJoinedEventSchema = z
  .object({
    payload: z
      .object({
        connections: z.number().int().nonnegative(),
        connectedAt: z.iso.datetime(),
        roomId: RoomIdSchema,
      })
      .strict(),
    requestId: RequestIdSchema,
    type: z.literal('room.joined'),
    v: EventVersionSchema,
  })
  .strict();

export const MessageCreatedEventSchema = z
  .object({
    payload: z
      .object({
        acceptedAt: z.iso.datetime(),
        authorId: z.uuid(),
        clientMessageId: ClientMessageIdSchema,
        messageId: MessageIdSchema,
        roomId: RoomIdSchema,
        text: MessageTextSchema,
      })
      .strict(),
    requestId: RequestIdSchema,
    type: z.literal('message.created'),
    v: EventVersionSchema,
  })
  .strict();

export const RoomStatsEventSchema = z
  .object({
    payload: z
      .object({
        connections: z.number().int().nonnegative(),
        roomId: RoomIdSchema,
        updatedAt: z.iso.datetime(),
      })
      .strict(),
    requestId: RequestIdSchema,
    type: z.literal('room.stats'),
    v: EventVersionSchema,
  })
  .strict();

export const RealtimeErrorEventSchema = z
  .object({
    payload: z
      .object({
        code: z.enum(ApiErrorCode),
        message: z.string().min(1),
        retryAfterMs: z.number().int().nonnegative().optional(),
      })
      .strict(),
    requestId: RequestIdSchema,
    type: z.literal('error'),
    v: EventVersionSchema,
  })
  .strict();

export const ServerRealtimeEventSchema = z.discriminatedUnion('type', [
  MessageCreatedEventSchema,
  RealtimeErrorEventSchema,
  RoomJoinedEventSchema,
  RoomStatsEventSchema,
]);

export const DistributedRealtimeEventSchema = z.discriminatedUnion('type', [
  MessageCreatedEventSchema,
  RoomStatsEventSchema,
]);

export type ServerRealtimeEvent = z.infer<typeof ServerRealtimeEventSchema>;
export type MessageCreatedEvent = z.infer<typeof MessageCreatedEventSchema>;
export type DistributedRealtimeEvent = z.infer<
  typeof DistributedRealtimeEventSchema
>;
