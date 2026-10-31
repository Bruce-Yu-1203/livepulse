import { describe, expect, it, vi } from 'vitest';

import type { AvatarService } from '../auth/avatar.service.js';
import type { DatabaseService } from '../database/database.service.js';
import { LiveChannelsService } from './live-channels.service.js';

const hostId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function setup() {
  const findRooms = vi.fn().mockResolvedValue([
    {
      _count: { likes: 25 },
      coverImageUrl: null,
      createdAt: new Date('2026-10-09T15:30:00.000Z'),
      description: 'A live room',
      host: {
        avatarKey: 'avatars/host/avatar',
        id: hostId,
        image: null,
        name: 'Jamie',
        updatedAt: new Date('2026-10-09T15:30:00.000Z'),
      },
      hostId,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      startedAt: new Date('2026-10-09T15:30:00.000Z'),
      status: 'LIVE',
      title: 'Architecture Lab',
      updatedAt: new Date('2026-10-09T15:30:00.000Z'),
      version: 1,
    },
  ]);
  const findFollows = vi.fn().mockResolvedValue([{ followedId: hostId }]);
  const database = {
    client: {
      room: { findMany: findRooms },
      userFollow: { findMany: findFollows },
    },
  } as unknown as DatabaseService;
  const avatars = {
    avatarUrl: vi.fn().mockReturnValue('https://example.com/jamie.png'),
  } as unknown as AvatarService;
  return {
    service: new LiveChannelsService(database, avatars),
    findRooms,
    findFollows,
  };
}

describe('LiveChannelsService', () => {
  it('loads only live rooms ranked by likes and marks followed hosts', async () => {
    const { service, findRooms, findFollows } = setup();
    const channels = await service.list('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

    expect(findRooms).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ likes: { _count: 'desc' } }, { id: 'desc' }],
        where: { status: 'LIVE' },
      }),
    );
    expect(findFollows).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          followerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          followedId: { in: [hostId] },
        },
      }),
    );
    expect(channels).toEqual([
      expect.objectContaining({
        following: true,
        host: {
          avatarUrl: 'https://example.com/jamie.png',
          id: hostId,
          name: 'Jamie',
        },
        room: expect.objectContaining({ likeCount: 25, status: 'LIVE' }),
      }),
    ]);
  });

  it('does not query follows for anonymous viewers', async () => {
    const { service, findFollows } = setup();
    expect((await service.list())[0]?.following).toBe(false);
    expect(findFollows).not.toHaveBeenCalled();
  });
});
