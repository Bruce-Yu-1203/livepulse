import { describe, expect, it } from 'vitest';

import {
  categoryHref,
  categoryName,
  formatLiveFor,
  parseCategoryParam,
} from './categories';

describe('category helpers', () => {
  it('names categories and links to their browse page', () => {
    expect(categoryName('irl')).toBe('IRL');
    expect(categoryName('art')).toBe('Art & Making');
    expect(categoryName('retired')).toBe('Just Chatting');
    expect(categoryHref('gaming')).toBe('/browse/gaming');
  });

  it('accepts only known category parameters', () => {
    expect(parseCategoryParam('music')).toBe('music');
    expect(parseCategoryParam(['food', 'irl'])).toBe('food');
    expect(parseCategoryParam('Music')).toBeUndefined();
    expect(parseCategoryParam(undefined)).toBeUndefined();
  });

  it('formats how long a room has been live', () => {
    const now = Date.parse('2026-10-31T12:00:00.000Z');
    expect(formatLiveFor('2026-10-31T09:55:00.000Z', now)).toBe('2h 05m');
    expect(formatLiveFor('2026-10-31T11:48:00.000Z', now)).toBe('12m');
    expect(formatLiveFor(null, now)).toBeNull();
  });
});
