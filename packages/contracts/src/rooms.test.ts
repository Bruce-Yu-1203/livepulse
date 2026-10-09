import { describe, expect, it } from 'vitest';

import { CreateRoomRequestSchema, CreateRoomResponseSchema } from './rooms.js';

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
