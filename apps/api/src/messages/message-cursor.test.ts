import { describe, expect, it } from 'vitest';

import { MessageCursorCodec } from './message-cursor.js';
import { InvalidMessageCursorError } from './messages.errors.js';

describe('MessageCursorCodec', () => {
  const codec = new MessageCursorCodec();
  const cursor = {
    acceptedAt: new Date('2026-10-09T20:00:00.000Z'),
    messageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };

  it('round-trips an opaque versioned cursor', () => {
    const encoded = codec.encode(cursor);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain(cursor.messageId);
    expect(codec.decode(encoded)).toEqual(cursor);
  });

  it.each([
    'not+base64url',
    Buffer.from('{}').toString('base64url'),
    Buffer.from(
      JSON.stringify({
        acceptedAt: 'invalid',
        messageId: cursor.messageId,
        version: 1,
      }),
    ).toString('base64url'),
  ])('rejects malformed cursor input', (encoded) => {
    expect(() => codec.decode(encoded)).toThrow(InvalidMessageCursorError);
  });
});
