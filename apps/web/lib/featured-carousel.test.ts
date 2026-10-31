import { describe, expect, it } from 'vitest';

import {
  carouselNeighbors,
  featuredAutoplayMs,
  selectFeaturedRooms,
  wrapIndex,
} from './featured-carousel';

describe('featured carousel', () => {
  it('features live rooms first and falls back to any room', () => {
    const live = { id: 'live', status: 'LIVE' as const };
    const ended = { id: 'ended', status: 'ENDED' as const };

    expect(selectFeaturedRooms([ended, live])).toEqual([live]);
    expect(selectFeaturedRooms([ended])).toEqual([ended]);
    expect(
      selectFeaturedRooms(
        Array.from({ length: 8 }, (_, index) => ({
          id: String(index),
          status: 'LIVE' as const,
        })),
      ),
    ).toHaveLength(5);
  });

  it('wraps indexes in both directions', () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(4, 0)).toBe(0);
  });

  it('only exposes neighbors when there is more than one slide', () => {
    expect(carouselNeighbors(0, 1)).toBeUndefined();
    expect(carouselNeighbors(0, 3)).toEqual({ next: 1, previous: 2 });
  });
});

describe('featuredAutoplayMs', () => {
  it('advances slowly enough to read a room', () => {
    expect(featuredAutoplayMs).toBeGreaterThanOrEqual(5000);
  });
});
