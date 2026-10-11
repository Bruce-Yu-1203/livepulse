import { describe, expect, it, vi } from 'vitest';

import type { AuditLogsRepository } from './audit-logs.repository.js';
import { AuditLogsService } from './audit-logs.service.js';

describe('AuditLogsService', () => {
  it('returns newest-first pages with an opaque continuation cursor', async () => {
    const repository: AuditLogsRepository = { list: vi.fn() };
    const records = [
      auditRecord('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '16:00:00'),
      auditRecord('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '15:59:00'),
    ];
    vi.mocked(repository.list).mockResolvedValue(records);
    const service = new AuditLogsService(repository);

    await expect(service.list({ limit: 1 })).resolves.toEqual({
      items: [records[0]],
      nextCursor: expect.any(String),
    });
    expect(repository.list).toHaveBeenCalledWith({
      cursor: undefined,
      take: 2,
    });
  });
});

function auditRecord(id: string, time: string) {
  return {
    action: 'MESSAGE_DELETED' as const,
    actorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    createdAt: new Date(`2026-10-11T${time}.000Z`),
    id,
    roomId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    targetId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  };
}
