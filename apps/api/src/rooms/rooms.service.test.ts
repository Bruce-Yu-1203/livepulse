import { describe, expect, it, vi } from 'vitest';

import type { RoomsRepository } from './rooms.repository.js';
import { RoomsService } from './rooms.service.js';

describe('RoomsService', () => {
  it('uses the authenticated user as host and creates a draft', async () => {
    const rooms: RoomsRepository = {
      create: vi.fn().mockResolvedValue({
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
        createdAt: new Date('2026-10-09T14:30:00.000Z'),
        demoVideoUrl: 'https://video.example.com/demo.mp4',
        description: 'A room description',
        hostId: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
        id: '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
        status: 'DRAFT',
        title: 'Live room',
        updatedAt: new Date('2026-10-09T14:30:00.000Z'),
      }),
    };
    const service = new RoomsService(rooms);

    const result = await service.create(
      '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
      {
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
        demoVideoUrl: 'https://video.example.com/demo.mp4',
        description: 'A room description',
        title: 'Live room',
      },
    );

    expect(rooms.create).toHaveBeenCalledWith({
      coverImageUrl: 'https://cdn.example.com/cover.jpg',
      demoVideoUrl: 'https://video.example.com/demo.mp4',
      description: 'A room description',
      hostId: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
      title: 'Live room',
    });
    expect(result.status).toBe('DRAFT');
  });
});
