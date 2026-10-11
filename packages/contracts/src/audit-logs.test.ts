import { describe, expect, it } from 'vitest';

import {
  AuditLogSchema,
  ListAuditLogsQuerySchema,
  ListAuditLogsResponseSchema,
} from './audit-logs.js';

const log = {
  action: 'MESSAGE_DELETED' as const,
  actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  createdAt: '2026-10-11T16:00:00.000Z',
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  targetId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};

describe('audit log contracts', () => {
  it('accepts an explicit moderation audit DTO', () => {
    expect(AuditLogSchema.parse(log)).toEqual(log);
    expect(
      ListAuditLogsResponseSchema.parse({
        items: [log],
        nextCursor: 'next-audit-page',
        requestId: 'request-audit-1',
      }).items,
    ).toEqual([log]);
  });

  it('applies bounded audit-history pagination', () => {
    expect(ListAuditLogsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(
      ListAuditLogsQuerySchema.parse({ cursor: 'opaque-cursor', limit: '5' }),
    ).toEqual({ cursor: 'opaque-cursor', limit: 5 });
    expect(ListAuditLogsQuerySchema.safeParse({ limit: 51 }).success).toBe(
      false,
    );
  });

  it('rejects unknown audit actions and extra fields', () => {
    expect(
      AuditLogSchema.safeParse({ ...log, action: 'UNKNOWN' }).success,
    ).toBe(false);
    expect(AuditLogSchema.safeParse({ ...log, secret: true }).success).toBe(
      false,
    );
  });
});
