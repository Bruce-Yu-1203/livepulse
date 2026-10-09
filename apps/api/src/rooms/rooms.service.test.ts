import { describe, expect, it, vi } from 'vitest';

import { InvalidRoomCursorError, RoomNotFoundError } from './rooms.errors.js';
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
      findVisibleById: vi.fn(),
      listVisible: vi.fn(),
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

  it('fetches one extra room and returns a cursor after the requested page', async () => {
    const records = [
      visibleRoom(
        '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
        '2026-10-09T15:30:00.000Z',
      ),
      visibleRoom(
        '60d4405f-8c2a-4306-ac4d-b8d85c83c875',
        '2026-10-09T15:29:00.000Z',
      ),
    ];
    const rooms: RoomsRepository = {
      create: vi.fn(),
      findVisibleById: vi.fn(),
      listVisible: vi.fn().mockResolvedValue(records),
    };
    const service = new RoomsService(rooms);

    const page = await service.list({ limit: 1 });

    expect(rooms.listVisible).toHaveBeenCalledWith({
      cursor: undefined,
      take: 2,
    });
    expect(page.items).toEqual([records[0]]);
    expect(page.nextCursor).toEqual(expect.any(String));

    await service.list({ cursor: page.nextCursor ?? undefined, limit: 1 });
    expect(rooms.listVisible).toHaveBeenLastCalledWith({
      cursor: {
        createdAt: records[0]?.createdAt,
        id: records[0]?.id,
      },
      take: 2,
    });
  });

  it('rejects an invalid cursor before querying the repository', async () => {
    const rooms: RoomsRepository = {
      create: vi.fn(),
      findVisibleById: vi.fn(),
      listVisible: vi.fn(),
    };
    const service = new RoomsService(rooms);

    await expect(
      service.list({ cursor: 'invalid+cursor', limit: 20 }),
    ).rejects.toBeInstanceOf(InvalidRoomCursorError);
    expect(rooms.listVisible).not.toHaveBeenCalled();
  });

  it('returns a visible room and hides a missing or draft room', async () => {
    const room = visibleRoom(
      '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
      '2026-10-09T15:30:00.000Z',
    );
    const rooms: RoomsRepository = {
      create: vi.fn(),
      findVisibleById: vi
        .fn()
        .mockResolvedValueOnce(room)
        .mockResolvedValueOnce(undefined),
      listVisible: vi.fn(),
    };
    const service = new RoomsService(rooms);

    await expect(service.getVisible(room.id)).resolves.toEqual(room);
    await expect(service.getVisible(room.id)).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });
});

function visibleRoom(id: string, createdAt: string) {
  return {
    coverImageUrl: 'https://cdn.example.com/cover.jpg',
    createdAt: new Date(createdAt),
    demoVideoUrl: 'https://video.example.com/demo.mp4',
    description: 'A room description',
    hostId: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
    id,
    status: 'LIVE' as const,
    title: 'Live room',
    updatedAt: new Date(createdAt),
  };
}
