import { describe, expect, it } from 'vitest';

import {
  ListRoomMessagesQuerySchema,
  ListRoomMessagesResponseSchema,
} from './messages.js';

const message = {
  acceptedAt: '2026-10-09T20:00:00.000Z',
  authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  clientMessageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  messageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  roomId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  text: 'A persisted message',
};

describe('room message contracts', () => {
  it('coerces pagination input and applies the default page size', () => {
    expect(ListRoomMessagesQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(ListRoomMessagesQuerySchema.parse({ limit: '25' })).toEqual({
      limit: 25,
    });
    expect(ListRoomMessagesQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
  });

  it('accepts a chronological history response and rejects extra fields', () => {
    expect(
      ListRoomMessagesResponseSchema.parse({
        items: [message],
        nextCursor: null,
        requestId: 'request-1',
      }).items,
    ).toEqual([message]);
    expect(
      ListRoomMessagesResponseSchema.safeParse({
        items: [{ ...message, unexpected: true }],
        nextCursor: null,
        requestId: 'request-1',
      }).success,
    ).toBe(false);
  });
});
