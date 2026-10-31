import { describe, expect, it } from 'vitest';

import {
  findRoomCategory,
  ListCategoriesResponseSchema,
  RoomCategorySchema,
  roomCategories,
  roomCategorySlugs,
  toRoomCategory,
} from './categories.js';
import {
  CreateRoomRequestSchema,
  ListRoomsQuerySchema,
  UpdateRoomRequestSchema,
} from './rooms.js';

describe('room categories', () => {
  it('defines nine unique categories starting with the default', () => {
    expect(roomCategorySlugs).toEqual([
      'just-chatting',
      'irl',
      'gaming',
      'music',
      'art',
      'tech',
      'study',
      'food',
      'sports',
    ]);
    expect(new Set(roomCategories.map((item) => item.name)).size).toBe(9);
  });

  it('accepts known slugs and rejects others', () => {
    expect(RoomCategorySchema.parse('irl')).toBe('irl');
    expect(RoomCategorySchema.safeParse('IRL').success).toBe(false);
    expect(RoomCategorySchema.safeParse('other').success).toBe(false);
  });

  it('looks up category details and narrows stored values', () => {
    expect(findRoomCategory('gaming')?.name).toBe('Gaming');
    expect(findRoomCategory('unknown')).toBeUndefined();
    expect(toRoomCategory('music')).toBe('music');
    expect(toRoomCategory('retired-slug')).toBe('just-chatting');
  });

  it('carries the category through room requests', () => {
    const base = { description: 'Walking around', title: 'Night walk' };
    expect(
      CreateRoomRequestSchema.parse({ ...base, category: 'irl' }).category,
    ).toBe('irl');
    expect(
      CreateRoomRequestSchema.safeParse({ ...base, category: 'nope' }).success,
    ).toBe(false);
    expect(ListRoomsQuerySchema.parse({ category: 'gaming' }).category).toBe(
      'gaming',
    );
    expect(
      UpdateRoomRequestSchema.safeParse({
        category: 'food',
        expectedVersion: 2,
      }).success,
    ).toBe(true);
  });

  it('validates the category list response', () => {
    expect(
      ListCategoriesResponseSchema.safeParse({
        items: [
          {
            description: 'Out in the world.',
            liveCount: 3,
            name: 'IRL',
            slug: 'irl',
          },
        ],
        requestId: 'req-1',
      }).success,
    ).toBe(true);
  });
});
