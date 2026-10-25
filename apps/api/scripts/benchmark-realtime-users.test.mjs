import { describe, expect, it, vi } from 'vitest';

import {
  benchmarkViewerEmail,
  prepareBenchmarkViewers,
} from './benchmark-realtime-users.mjs';

describe('benchmark viewer setup', () => {
  it('creates distinct viewer identities with the source password hash', async () => {
    const database = {
      account: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        findFirst: vi.fn().mockResolvedValue({ password: 'stored-hash' }),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      user: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        findMany: vi.fn().mockResolvedValue([
          { email: 'viewer+benchmark-1@example.com', id: 'user-1' },
          { email: 'viewer+benchmark-2@example.com', id: 'user-2' },
        ]),
      },
    };

    await expect(
      prepareBenchmarkViewers(database, 'viewer@example.com', 2),
    ).resolves.toEqual([
      'viewer+benchmark-1@example.com',
      'viewer+benchmark-2@example.com',
    ]);
    expect(database.account.createMany).toHaveBeenCalledWith({
      data: [
        {
          accountId: 'user-1',
          password: 'stored-hash',
          providerId: 'credential',
          userId: 'user-1',
        },
        {
          accountId: 'user-2',
          password: 'stored-hash',
          providerId: 'credential',
          userId: 'user-2',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('rejects invalid or oversized source emails', () => {
    expect(() => benchmarkViewerEmail('invalid', 0)).toThrow(/valid email/u);
    expect(() =>
      benchmarkViewerEmail(`${'a'.repeat(300)}@example.com`, 0),
    ).toThrow(/too long/u);
  });
});
