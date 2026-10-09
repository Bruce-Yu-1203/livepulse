import { describe, expect, it } from 'vitest';

import {
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  GetRoomParamsSchema,
  GetRoomResponseSchema,
  ListRoomsQuerySchema,
  ListRoomsResponseSchema,
} from './rooms.js';

const validRequest = {
  coverImageUrl: 'https://cdn.example.com/live/cover.jpg',
  demoVideoUrl: 'https://video.example.com/demo.mp4',
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

  it.each([
    { ...validRequest, title: '' },
    { ...validRequest, title: 'x'.repeat(121) },
    { ...validRequest, description: 'x'.repeat(2_001) },
    { ...validRequest, coverImageUrl: 'ftp://example.com/cover.jpg' },
    { ...validRequest, demoVideoUrl: 'not-a-url' },
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
        status: 'DRAFT',
        updatedAt: '2026-10-09T14:30:00.000Z',
      },
    };

    expect(CreateRoomResponseSchema.parse(response)).toEqual(response);
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
          status: 'LIVE',
          updatedAt: '2026-10-09T14:30:00.000Z',
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
    status: 'LIVE' as const,
    updatedAt: '2026-10-09T14:30:00.000Z',
  };

  it('applies a default limit and accepts an opaque cursor', () => {
    expect(ListRoomsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(
      ListRoomsQuerySchema.parse({ cursor: 'opaque-cursor', limit: '5' }),
    ).toEqual({ cursor: 'opaque-cursor', limit: 5 });
  });

  it.each([{ limit: '0' }, { limit: '51' }, { page: '2' }])(
    'rejects invalid or offset-style pagination: %o',
    (query) => {
      expect(ListRoomsQuerySchema.safeParse(query).success).toBe(false);
    },
  );

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
