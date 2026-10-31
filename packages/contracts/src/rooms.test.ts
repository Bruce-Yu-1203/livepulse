import { describe, expect, it } from 'vitest';

import {
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  CurrentBroadcastResponseSchema,
  GetRoomParamsSchema,
  GetRoomResponseSchema,
  ListOwnedRoomsResponseSchema,
  ListBroadcastHistoryQuerySchema,
  ListBroadcastHistoryResponseSchema,
  ListRoomsQuerySchema,
  ListRoomsResponseSchema,
  LiveChannelsResponseSchema,
  RoomLikeResponseSchema,
  UpdateRoomRequestSchema,
  UpdateRoomResponseSchema,
} from './rooms.js';

const validRequest = {
  category: 'just-chatting' as const,
  coverImageUrl: 'https://cdn.example.com/live/cover.jpg',
  description: 'A live room for TypeScript learners.',
  title: 'Build LivePulse Together',
};

describe('CreateRoomRequestSchema', () => {
  it('normalizes text and accepts HTTP media URLs', () => {
    expect(
      CreateRoomRequestSchema.parse({
        ...validRequest,
        description: ` ${validRequest.description} `,
        title: ` ${validRequest.title} `,
      }),
    ).toEqual(validRequest);
  });

  it('allows the cover to be generated when broadcasting starts', () => {
    const withoutCover = {
      description: validRequest.description,
      title: validRequest.title,
    };

    expect(CreateRoomRequestSchema.parse(withoutCover)).toEqual(withoutCover);
  });

  it.each([
    { ...validRequest, title: '' },
    { ...validRequest, title: 'x'.repeat(121) },
    { ...validRequest, description: 'x'.repeat(2_001) },
    { ...validRequest, coverImageUrl: 'ftp://example.com/cover.jpg' },
    { ...validRequest, demoVideoUrl: 'https://example.com/legacy.mp4' },
    { ...validRequest, status: 'LIVE' },
  ])('rejects invalid or server-owned room input: %o', (input) => {
    expect(CreateRoomRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe('CreateRoomResponseSchema', () => {
  it('accepts a newly created draft room', () => {
    const response = {
      requestId: 'request-room-1',
      room: {
        ...validRequest,
        createdAt: '2026-10-09T14:30:00.000Z',
        hostId: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
        id: '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
        likeCount: 0,
        status: 'DRAFT',
        updatedAt: '2026-10-09T14:30:00.000Z',
        version: 1,
      },
    };

    expect(CreateRoomResponseSchema.parse(response)).toEqual(response);
    expect(
      CreateRoomResponseSchema.safeParse({
        ...response,
        room: { ...response.room, startedAt: 'not-a-date' },
      }).success,
    ).toBe(false);
  });

  it('rejects a non-draft create response', () => {
    expect(
      CreateRoomResponseSchema.safeParse({
        requestId: 'request-room-2',
        room: {
          ...validRequest,
          createdAt: '2026-10-09T14:30:00.000Z',
          hostId: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
          id: '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
          likeCount: 0,
          status: 'LIVE',
          updatedAt: '2026-10-09T14:30:00.000Z',
          version: 1,
        },
      }).success,
    ).toBe(false);
  });
});

describe('public room queries', () => {
  const visibleRoom = {
    ...validRequest,
    createdAt: '2026-10-09T14:30:00.000Z',
    hostId: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
    id: '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
    likeCount: 3,
    status: 'LIVE' as const,
    startedAt: '2026-10-09T14:30:00.000Z',
    updatedAt: '2026-10-09T14:30:00.000Z',
    version: 2,
  };

  it('validates live channel host and follow metadata', () => {
    const response = {
      items: [
        {
          room: visibleRoom,
          host: {
            avatarUrl: 'https://example.com/avatar.png',
            id: visibleRoom.hostId,
            name: 'Jamie',
          },
          following: true,
        },
      ],
      requestId: 'channels-1',
    };
    expect(LiveChannelsResponseSchema.parse(response)).toEqual(response);
    expect(
      LiveChannelsResponseSchema.safeParse({
        ...response,
        items: [
          {
            ...response.items[0],
            host: {
              avatarUrl: 'https://example.com/avatar.png',
              id: 'bad-id',
              name: 'Jamie',
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('applies a default limit and accepts an opaque cursor', () => {
    expect(ListRoomsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(
      ListRoomsQuerySchema.parse({
        cursor: 'opaque-cursor',
        limit: '5',
        q: '  Design   Critique  ',
      }),
    ).toEqual({ cursor: 'opaque-cursor', limit: 5, q: 'Design Critique' });
  });

  it.each([
    { limit: '0' },
    { limit: '51' },
    { page: '2' },
    { q: 'x'.repeat(81) },
  ])('rejects invalid or offset-style pagination: %o', (query) => {
    expect(ListRoomsQuerySchema.safeParse(query).success).toBe(false);
  });

  it('accepts visible list and detail responses', () => {
    expect(
      ListRoomsResponseSchema.parse({
        items: [visibleRoom],
        nextCursor: 'next-page',
        requestId: 'request-list-1',
      }).items,
    ).toEqual([visibleRoom]);
    expect(
      GetRoomResponseSchema.parse({
        requestId: 'request-detail-1',
        room: { ...visibleRoom, status: 'ENDED' },
      }).room.status,
    ).toBe('ENDED');
    expect(GetRoomParamsSchema.safeParse({ id: visibleRoom.id }).success).toBe(
      true,
    );
  });

  it('rejects draft rooms from public responses', () => {
    expect(
      ListRoomsResponseSchema.safeParse({
        items: [{ ...visibleRoom, status: 'DRAFT' }],
        nextCursor: null,
        requestId: 'request-list-2',
      }).success,
    ).toBe(false);
  });
});

describe('host room management', () => {
  const room = {
    ...validRequest,
    createdAt: '2026-10-09T14:30:00.000Z',
    hostId: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
    id: '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
    likeCount: 0,
    status: 'DRAFT' as const,
    updatedAt: '2026-10-09T14:30:00.000Z',
    version: 1,
  };

  it('validates broadcast history filters and hides drafts from history', () => {
    expect(
      ListBroadcastHistoryQuerySchema.parse({ q: '  Team   Sync  ' }),
    ).toEqual({
      limit: 10,
      q: 'Team Sync',
    });
    expect(
      ListBroadcastHistoryQuerySchema.safeParse({ limit: '51' }).success,
    ).toBe(false);
    expect(
      ListBroadcastHistoryQuerySchema.safeParse({
        from: '2026-10-23T00:00:00.000Z',
        to: '2026-10-22T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      ListBroadcastHistoryResponseSchema.safeParse({
        items: [room],
        nextCursor: null,
        requestId: 'history-1',
      }).success,
    ).toBe(false);
    expect(
      ListBroadcastHistoryResponseSchema.parse({
        items: [{ ...room, status: 'ENDED' }],
        nextCursor: null,
        requestId: 'history-2',
      }).items,
    ).toHaveLength(1);
    expect(
      CurrentBroadcastResponseSchema.parse({
        requestId: 'current-1',
        room: null,
      }),
    ).toEqual({ requestId: 'current-1', room: null });
  });

  it('accepts owned rooms and versioned updates', () => {
    expect(
      ListOwnedRoomsResponseSchema.parse({
        items: [room],
        requestId: 'request-owned-1',
      }).items,
    ).toEqual([room]);
    expect(
      UpdateRoomRequestSchema.parse({
        expectedVersion: 1,
        status: 'LIVE',
        title: 'Updated room',
      }),
    ).toEqual({ expectedVersion: 1, status: 'LIVE', title: 'Updated room' });
    expect(
      UpdateRoomResponseSchema.parse({
        requestId: 'request-update-1',
        room: { ...room, version: 2 },
      }).room.version,
    ).toBe(2);
  });

  it('accepts a generated cover frame', () => {
    expect(
      UpdateRoomRequestSchema.parse({
        coverImageUrl: 'data:image/jpeg;base64,Y292ZXI=',
        expectedVersion: 1,
      }),
    ).toEqual({
      coverImageUrl: 'data:image/jpeg;base64,Y292ZXI=',
      expectedVersion: 1,
    });
  });

  it.each([
    { expectedVersion: 0, title: 'Updated room' },
    { expectedVersion: 1 },
    { expectedVersion: 1, title: '' },
    { expectedVersion: 1, unknown: true },
  ])('rejects invalid room updates: %o', (input) => {
    expect(UpdateRoomRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe('room likes', () => {
  it('accepts an authenticated room-like summary', () => {
    expect(
      RoomLikeResponseSchema.parse({
        likeCount: 12,
        liked: true,
        requestId: 'request-like-1',
      }),
    ).toEqual({ likeCount: 12, liked: true, requestId: 'request-like-1' });
  });

  it.each([
    { likeCount: -1, liked: true, requestId: 'request-like-2' },
    { likeCount: 1.5, liked: true, requestId: 'request-like-3' },
    { likeCount: 1, liked: 'yes', requestId: 'request-like-4' },
  ])('rejects an invalid room-like summary: %o', (response) => {
    expect(RoomLikeResponseSchema.safeParse(response).success).toBe(false);
  });
});
