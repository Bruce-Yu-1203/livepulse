import { Injectable } from '@nestjs/common';
import type { SearchQuery, SearchUser } from '@livepulse/contracts';

import { AvatarService } from '../auth/avatar.service.js';
import { DatabaseService } from '../database/database.service.js';
import { RoomsService } from '../rooms/rooms.service.js';

@Injectable()
export class SearchService {
  public constructor(
    private readonly database: DatabaseService,
    private readonly rooms: RoomsService,
    private readonly avatars: AvatarService,
  ) {}

  public async search(query: SearchQuery) {
    const term = query.q.replace(/[\\%_]/gu, '\\$&');
    const [users, roomPage] = await Promise.all([
      this.database.client.user.findMany({
        orderBy: [{ username: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        select: {
          avatarKey: true,
          id: true,
          image: true,
          name: true,
          updatedAt: true,
          username: true,
        },
        take: query.limit,
        where: {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { username: { contains: term, mode: 'insensitive' } },
          ],
        },
      }),
      this.rooms.list({ limit: query.limit, q: query.q }),
    ]);

    return {
      rooms: roomPage.items.map((room) => ({
        ...room,
        createdAt: room.createdAt.toISOString(),
        updatedAt: room.updatedAt.toISOString(),
      })),
      users: users.map((user) => this.publicUser(user)),
    };
  }

  public async getUser(id: string) {
    const user = await this.database.client.user.findUnique({
      select: {
        _count: { select: { followers: true, following: true } },
        avatarKey: true,
        createdAt: true,
        id: true,
        image: true,
        name: true,
        updatedAt: true,
        username: true,
      },
      where: { id },
    });
    return user
      ? {
          ...this.publicUser(user),
          followerCount: user._count.followers,
          followingCount: user._count.following,
          joinedAt: user.createdAt.toISOString(),
        }
      : undefined;
  }

  public publicUser(user: {
    avatarKey: string | null;
    id: string;
    image: string | null;
    name: string;
    updatedAt: Date;
    username: string | null;
  }): SearchUser {
    return {
      avatarUrl: user.avatarKey
        ? this.avatars.avatarUrl(user.id, user.updatedAt)
        : user.image && /^https?:\/\//u.test(user.image)
          ? user.image
          : null,
      id: user.id,
      name: user.name,
      username: user.username,
    };
  }
}
