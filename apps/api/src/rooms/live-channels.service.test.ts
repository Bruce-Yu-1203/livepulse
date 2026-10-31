import { describe, expect, it, vi } from 'vitest';

import type { AvatarService } from '../auth/avatar.service.js';
import type { DatabaseService } from '../database/database.service.js';
import {
  LiveChannelsService,
  liveChannelLimit,
} from './live-channels.service.js';

const hostId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function liveRoom(id: string, roomHostId: string, likes: number) {
  return {
    _count: { likes },
    coverImageUrl: null,
    createdAt: new Date('2026-10-09T15:30:00.000Z'),
    description: 'A live room',
    host: {
      avatarKey: roomHostId === hostId ? 'avatars/host/avatar' : null,
      id: roomHostId,
      image: null,
      name: roomHostId === hostId ? 'Jamie' : 'Riley',
      updatedAt: new Date('2026-10-09T15:30:00.000Z'),
    },
    hostId: roomHostId,
    id,
    startedAt: new Date('2026-10-09T15:30:00.000Z'),
    status: 'LIVE',
    title: 'Architecture Lab',
    updatedAt: new Date('2026-10-09T15:30:00.000Z'),
    version: 1,
  };
}

const otherHostId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const popularRoom = liveRoom(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  otherHostId,
  25,
);
const followedRoom = liveRoom(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  hostId,
  3,
);

function setup() {
  // The first call loads popular rooms, the second followed hosts' rooms.
  const findRooms = vi
    .fn()
    .mockResolvedValueOnce([popularRoom, followedRoom])
    .mockResolvedValueOnce([followedRoom]);
  const database = {
    client: { room: { findMany: findRooms } },
  } as unknown as DatabaseService;
  const avatars = {
    avatarUrl: vi.fn().mockReturnValue('https://example.com/jamie.png'),
  } as unknown as AvatarService;
  return {
    service: new LiveChannelsService(database, avatars),
    findRooms,
  };
}

describe('LiveChannelsService', () => {
  it('caps popular live rooms, adds followed hosts, and marks them', async () => {
    const { service, findRooms } = setup();
    const viewerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const channels = await service.list(viewerId);

    expect(findRooms).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: [{ likes: { _count: 'desc' } }, { id: 'desc' }],
        take: liveChannelLimit,
        where: { status: 'LIVE' },
      }),
    );
    expect(findRooms).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: liveChannelLimit,
        where: {
          host: { followers: { some: { followerId: viewerId } } },
          status: 'LIVE',
        },
      }),
    );
    expect(
      channels.map((channel) => [channel.room.id, channel.following]),
    ).toEqual([
      [followedRoom.id, true],
      [popularRoom.id, false],
    ]);
    expect(channels[0]).toEqual(
      expect.objectContaining({
        host: {
          avatarUrl: 'https://example.com/jamie.png',
          id: hostId,
          name: 'Jamie',
        },
        room: expect.objectContaining({ likeCount: 3, status: 'LIVE' }),
      }),
    );
  });

  it('runs only the popular query for anonymous viewers', async () => {
    const { service, findRooms } = setup();
    const channels = await service.list();
    expect(findRooms).toHaveBeenCalledTimes(1);
    expect(channels.every((channel) => !channel.following)).toBe(true);
  });
});
