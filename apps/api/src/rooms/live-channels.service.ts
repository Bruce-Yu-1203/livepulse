import { Injectable } from '@nestjs/common';
import { toRoomCategory, type LiveChannel } from '@livepulse/contracts';

import { AvatarService } from '../auth/avatar.service.js';
import { DatabaseService } from '../database/database.service.js';

/** Upper bound for each live channel query; the rail pages through these. */
export const liveChannelLimit = 50;

@Injectable()
export class LiveChannelsService {
  public constructor(
    private readonly database: DatabaseService,
    private readonly avatars: AvatarService,
  ) {}

  public async list(viewerId?: string): Promise<LiveChannel[]> {
    const include = {
      _count: { select: { likes: true } },
      host: {
        select: {
          avatarKey: true,
          id: true,
          image: true,
          name: true,
          updatedAt: true,
        },
      },
    } as const;
    const orderBy = [
      { likes: { _count: 'desc' as const } },
      { id: 'desc' as const },
    ];
    // The rail shows the most liked live rooms plus every followed host who
    // is live, even when that host is outside the popular cap.
    const [popular, followed] = await Promise.all([
      this.database.client.room.findMany({
        include,
        orderBy,
        take: liveChannelLimit,
        where: { status: 'LIVE' },
      }),
      viewerId
        ? this.database.client.room.findMany({
            include,
            orderBy,
            take: liveChannelLimit,
            where: {
              host: { followers: { some: { followerId: viewerId } } },
              status: 'LIVE',
            },
          })
        : Promise.resolve([]),
    ]);
    const followedIds = new Set(followed.map((room) => room.hostId));
    const seen = new Set<string>();
    const rooms = [...followed, ...popular].filter((room) => {
      if (seen.has(room.id)) return false;
      seen.add(room.id);
      return true;
    });

    return rooms.map(({ _count, host, ...room }) => ({
      room: {
        ...room,
        category: toRoomCategory(room.category),
        createdAt: room.createdAt.toISOString(),
        likeCount: _count.likes,
        startedAt: room.startedAt?.toISOString() ?? null,
        status: 'LIVE',
        updatedAt: room.updatedAt.toISOString(),
      },
      host: {
        avatarUrl: host.avatarKey
          ? this.avatars.avatarUrl(host.id, host.updatedAt)
          : host.image && /^https?:\/\//u.test(host.image)
            ? host.image
            : null,
        id: host.id,
        name: host.name,
      },
      following: followedIds.has(room.hostId),
    }));
  }
}
