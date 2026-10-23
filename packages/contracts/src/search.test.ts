import { describe, expect, it } from 'vitest';

import {
  GetPublicUserResponseSchema,
  SearchQuerySchema,
  SearchSuggestionsResponseSchema,
} from './search.js';

const user = {
  avatarUrl: null,
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  name: 'Jamie Rivers',
  username: 'jamierivers',
};

describe('public search contracts', () => {
  it('normalizes a search term and applies a bounded result limit', () => {
    expect(SearchQuerySchema.parse({ q: '  Jamie   Rivers  ' })).toEqual({
      limit: 6,
      q: 'Jamie Rivers',
    });
    expect(SearchQuerySchema.parse({ limit: '10', q: 'live' }).limit).toBe(10);
    expect(SearchQuerySchema.safeParse({ q: '' }).success).toBe(false);
    expect(
      SearchQuerySchema.safeParse({ limit: '11', q: 'live' }).success,
    ).toBe(false);
  });

  it('accepts only public user fields in suggestions and profiles', () => {
    const response = { requestId: 'req-1', rooms: [], users: [user] };
    expect(SearchSuggestionsResponseSchema.parse(response)).toEqual(response);
    expect(
      SearchSuggestionsResponseSchema.safeParse({
        ...response,
        users: [{ ...user, email: 'private@example.com' }],
      }).success,
    ).toBe(false);
    expect(
      GetPublicUserResponseSchema.parse({
        requestId: 'req-2',
        user: { ...user, joinedAt: '2026-10-09T15:30:00.000Z' },
      }).user.name,
    ).toBe('Jamie Rivers');
  });
});
