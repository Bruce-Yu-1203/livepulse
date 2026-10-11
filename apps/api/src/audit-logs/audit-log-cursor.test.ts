import { describe, expect, it } from 'vitest';

import { AuditLogCursorCodec } from './audit-log-cursor.js';
import { InvalidAuditLogCursorError } from './audit-logs.errors.js';

describe('AuditLogCursorCodec', () => {
  const codec = new AuditLogCursorCodec();
  const cursor = {
    createdAt: new Date('2026-10-11T16:00:00.000Z'),
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
  ])('rejects malformed cursor input', (encoded) => {
    expect(() => codec.decode(encoded)).toThrow(InvalidAuditLogCursorError);
  });
});
