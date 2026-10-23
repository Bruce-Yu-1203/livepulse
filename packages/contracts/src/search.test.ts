import { describe, expect, it } from 'vitest';

import {
  FollowListQuerySchema,
  FollowListResponseSchema,
  FollowStateResponseSchema,
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
        user: {
          ...user,
          followerCount: 2,
          followingCount: 1,
          joinedAt: '2026-10-09T15:30:00.000Z',
        },
      }).user.name,
    ).toBe('Jamie Rivers');
  });

  it('bounds follow lists and keeps user details public', () => {
    expect(FollowListQuerySchema.parse({ page: '2' })).toEqual({
      limit: 20,
      page: 2,
    });
    expect(FollowListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(
      FollowListResponseSchema.parse({
        items: [user],
        nextPage: null,
        requestId: 'req-3',
      }).items,
    ).toEqual([user]);
    expect(
      FollowStateResponseSchema.parse({
        followerCount: 2,
        following: true,
        followingCount: 1,
        requestId: 'req-4',
      }).following,
    ).toBe(true);
  });
});
