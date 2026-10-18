import type { RoomMessage } from '@livepulse/contracts';
import { describe, expect, it } from 'vitest';

import { messagePayloadHash } from './messages.repository.js';

const message: RoomMessage = {
  acceptedAt: '2026-10-18T12:00:00.000Z',
  authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  clientMessageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  messageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  roomId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  text: 'Stored in PostgreSQL',
};

describe('PostgreSQL message payload hashing', () => {
  it('is stable across acknowledgement timestamps', () => {
    expect(
      messagePayloadHash({
        ...message,
        acceptedAt: '2026-10-18T12:00:05.000Z',
      }),
    ).toBe(messagePayloadHash(message));
  });

  it('detects a changed retry payload', () => {
    expect(
      messagePayloadHash({ ...message, text: 'Changed payload' }),
    ).not.toBe(messagePayloadHash(message));
  });
});
