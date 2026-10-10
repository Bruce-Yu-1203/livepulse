import { describe, expect, it } from 'vitest';

import {
  ClientRealtimeEventSchema,
  DistributedRealtimeEventSchema,
  MessageCreatedEventSchema,
  MessageSendEventSchema,
  RealtimeErrorEventSchema,
  RoomJoinedEventSchema,
} from './realtime.js';

const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const roomId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clientMessageId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('realtime contracts', () => {
  it('accepts strict room join and message send envelopes', () => {
    expect(
      ClientRealtimeEventSchema.parse({
        payload: { roomId },
        requestId,
        type: 'room.join',
        v: 1,
      }).type,
    ).toBe('room.join');
    expect(
      MessageSendEventSchema.parse({
        payload: { clientMessageId, roomId, text: '  Hello room  ' },
        requestId,
        type: 'message.send',
        v: 1,
      }).payload.text,
    ).toBe('Hello room');
    expect(
      RoomJoinedEventSchema.parse({
        payload: {
          connectedAt: '2026-10-10T12:00:00.000Z',
          connections: 2,
          roomId,
        },
        requestId,
        type: 'room.joined',
        v: 1,
      }).payload.connections,
    ).toBe(2);
  });

  it('rejects oversized messages and unknown fields', () => {
    expect(
      MessageSendEventSchema.safeParse({
        payload: { clientMessageId, roomId, text: 'x'.repeat(201) },
        requestId,
        type: 'message.send',
        v: 1,
      }).success,
    ).toBe(false);
    expect(
      MessageSendEventSchema.safeParse({
        payload: { clientMessageId, roomId, text: 'Hello' },
        requestId,
        type: 'message.send',
        unexpected: true,
        v: 1,
      }).success,
    ).toBe(false);
  });

  it('validates created-message and stable error events', () => {
    expect(
      MessageCreatedEventSchema.parse({
        payload: {
          acceptedAt: '2026-10-09T20:00:00.000Z',
          authorId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          clientMessageId,
          messageId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          roomId,
          text: 'Hello room',
        },
        requestId,
        type: 'message.created',
        v: 1,
      }).type,
    ).toBe('message.created');
    expect(
      RealtimeErrorEventSchema.parse({
        payload: {
          code: 'REALTIME_RATE_LIMITED',
          message: 'Wait before sending another message',
          retryAfterMs: 500,
        },
        requestId,
        type: 'error',
        v: 1,
      }).payload.retryAfterMs,
    ).toBe(500);
  });

  it('validates distributed room statistics', () => {
    const event = DistributedRealtimeEventSchema.parse({
      payload: {
        connections: 12,
        roomId,
        updatedAt: '2026-10-10T12:00:00.000Z',
      },
      requestId,
      type: 'room.stats',
      v: 1,
    });
    expect(event.type === 'room.stats' && event.payload.connections).toBe(12);
    expect(
      DistributedRealtimeEventSchema.safeParse({
        payload: {
          connections: -1,
          roomId,
          updatedAt: '2026-10-10T12:00:00.000Z',
        },
        requestId,
        type: 'room.stats',
        v: 1,
      }).success,
    ).toBe(false);
  });
});
