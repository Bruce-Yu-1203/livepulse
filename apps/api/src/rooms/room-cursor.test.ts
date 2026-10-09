import { describe, expect, it } from 'vitest';

import { RoomCursorCodec } from './room-cursor.js';
import { InvalidRoomCursorError } from './rooms.errors.js';

describe('RoomCursorCodec', () => {
  const codec = new RoomCursorCodec();
  const cursor = {
    createdAt: new Date('2026-10-09T15:30:00.000Z'),
    id: '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
  };

  it('round-trips an opaque versioned cursor', () => {
    const encoded = codec.encode(cursor);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain(cursor.id);
    expect(codec.decode(encoded)).toEqual(cursor);
  });

  it.each([
    'not+base64url',
    Buffer.from('{}').toString('base64url'),
    Buffer.from(
      JSON.stringify({
        createdAt: 'not-a-date',
        id: cursor.id,
        version: 1,
      }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        createdAt: cursor.createdAt.toISOString(),
        extra: true,
        id: cursor.id,
        version: 1,
      }),
    ).toString('base64url'),
  ])('rejects malformed cursor input', (encoded) => {
    expect(() => codec.decode(encoded)).toThrow(InvalidRoomCursorError);
  });
});
