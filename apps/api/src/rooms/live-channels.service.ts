import { Injectable } from '@nestjs/common';
import type { LiveChannel } from '@livepulse/contracts';

import { AvatarService } from '../auth/avatar.service.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class LiveChannelsService {
  public constructor(
    private readonly database: DatabaseService,
    private readonly avatars: AvatarService,
  ) {}

  public async list(viewerId?: string): Promise<LiveChannel[]> {
    const rooms = await this.database.client.room.findMany({
      include: {
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
      },
      orderBy: [{ likes: { _count: 'desc' } }, { id: 'desc' }],
      where: { status: 'LIVE' },
    });
    const followedIds = viewerId
      ? new Set(
          (
            await this.database.client.userFollow.findMany({
              select: { followedId: true },
              where: {
                followerId: viewerId,
                followedId: {
                  in: [...new Set(rooms.map((room) => room.hostId))],
                },
              },
            })
          ).map((follow) => follow.followedId),
        )
      : new Set<string>();

    return rooms.map(({ _count, host, ...room }) => ({
      room: {
        ...room,
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
