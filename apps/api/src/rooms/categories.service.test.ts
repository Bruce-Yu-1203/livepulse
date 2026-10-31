import { roomCategories } from '@livepulse/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service.js';
import { CategoriesService } from './categories.service.js';

function setup(groups: { _count: { _all: number }; category: string }[]) {
  const groupBy = vi.fn().mockResolvedValue(groups);
  const database = {
    client: { room: { groupBy } },
  } as unknown as DatabaseService;
  return { groupBy, service: new CategoriesService(database) };
}

describe('CategoriesService', () => {
  it('counts live rooms per category and lists the busiest first', async () => {
    const { groupBy, service } = setup([
      { _count: { _all: 2 }, category: 'music' },
      { _count: { _all: 5 }, category: 'irl' },
    ]);

    const items = await service.list();

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'LIVE' } }),
    );
    expect(items.map((item) => [item.slug, item.liveCount])).toEqual([
      ['irl', 5],
      ['music', 2],
      ['just-chatting', 0],
      ['gaming', 0],
      ['art', 0],
      ['tech', 0],
      ['study', 0],
      ['food', 0],
      ['sports', 0],
    ]);
  });

  it('returns every category even when nobody is live', async () => {
    const { service } = setup([]);

    const items = await service.list();

    expect(items).toHaveLength(roomCategories.length);
    expect(items[0]).toEqual({
      description: roomCategories[0].description,
      liveCount: 0,
      name: 'Just Chatting',
      slug: 'just-chatting',
    });
  });
});
