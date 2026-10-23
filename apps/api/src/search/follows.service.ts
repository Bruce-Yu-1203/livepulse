import { Injectable } from '@nestjs/common';
import type { FollowListQuery } from '@livepulse/contracts';

import { DatabaseService } from '../database/database.service.js';
import { SearchService } from './search.service.js';

@Injectable()
export class FollowsService {
  public constructor(
    private readonly database: DatabaseService,
    private readonly search: SearchService,
  ) {}

  public async state(userId: string, viewerId: string) {
    const user = await this.search.getUser(userId);
    if (!user) return undefined;
    const following =
      viewerId !== userId &&
      Boolean(
        await this.database.client.userFollow.findUnique({
          where: {
            followerId_followedId: { followerId: viewerId, followedId: userId },
          },
        }),
      );
    return {
      followerCount: user.followerCount,
      following,
      followingCount: user.followingCount,
    };
  }

  public async setFollowing(userId: string, viewerId: string, follow: boolean) {
    if (userId === viewerId) return { self: true as const };
    if (!(await this.search.getUser(userId))) return undefined;

    if (follow) {
      await this.database.client.userFollow.upsert({
        create: { followerId: viewerId, followedId: userId },
        update: {},
        where: {
          followerId_followedId: { followerId: viewerId, followedId: userId },
        },
      });
    } else {
      await this.database.client.userFollow.deleteMany({
        where: { followerId: viewerId, followedId: userId },
      });
    }
    return this.state(userId, viewerId);
  }

  public async list(
    userId: string,
    kind: 'followers' | 'following',
    query: FollowListQuery,
  ) {
    if (!(await this.search.getUser(userId))) return undefined;
    const follows = await this.database.client.userFollow.findMany({
      orderBy: [
        { createdAt: 'desc' },
        kind === 'followers' ? { followerId: 'desc' } : { followedId: 'desc' },
      ],
      select: {
        followed: {
          select: {
            avatarKey: true,
            id: true,
            image: true,
            name: true,
            updatedAt: true,
            username: true,
          },
        },
        follower: {
          select: {
            avatarKey: true,
            id: true,
            image: true,
            name: true,
            updatedAt: true,
            username: true,
          },
        },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit + 1,
      where:
        kind === 'followers' ? { followedId: userId } : { followerId: userId },
    });
    return {
      items: follows
        .slice(0, query.limit)
        .map((record) =>
          this.search.publicUser(
            kind === 'followers' ? record.follower : record.followed,
          ),
        ),
      nextPage: follows.length > query.limit ? query.page + 1 : null,
    };
  }
}
