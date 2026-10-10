import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@livepulse/db';

import { DatabaseService } from '../database/database.service.js';
import { RoomDatabaseUnavailableError } from './rooms.errors.js';

export interface RoomLikeSummary {
  likeCount: number;
  liked: boolean;
}

export interface RoomLikesRepository {
  get(roomId: string, userId: string): Promise<RoomLikeSummary | undefined>;
  setLiked(
    roomId: string,
    userId: string,
    liked: boolean,
  ): Promise<RoomLikeSummary | undefined>;
}

@Injectable()
export class PrismaRoomLikesRepository implements RoomLikesRepository {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async get(
    roomId: string,
    userId: string,
  ): Promise<RoomLikeSummary | undefined> {
    try {
      const room = await this.database.client.room.findFirst({
        select: {
          _count: { select: { likes: true } },
          likes: {
            select: { userId: true },
            take: 1,
            where: { userId },
          },
        },
        where: { id: roomId, status: { in: ['LIVE', 'ENDED'] } },
      });

      return room
        ? { likeCount: room._count.likes, liked: room.likes.length === 1 }
        : undefined;
    } catch (error) {
      throwRoomLikeDatabaseError(error);
    }
  }

  public async setLiked(
    roomId: string,
    userId: string,
    liked: boolean,
  ): Promise<RoomLikeSummary | undefined> {
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const room = await transaction.room.findFirst({
          select: { id: true },
          where: { id: roomId, status: { in: ['LIVE', 'ENDED'] } },
        });

        if (!room) {
          return undefined;
        }

        if (liked) {
          await transaction.roomLike.upsert({
            create: { roomId, userId },
            update: {},
            where: { roomId_userId: { roomId, userId } },
          });
        } else {
          await transaction.roomLike.deleteMany({ where: { roomId, userId } });
        }

        const likeCount = await transaction.roomLike.count({
          where: { roomId },
        });

        return { likeCount, liked };
      });
    } catch (error) {
      throwRoomLikeDatabaseError(error);
    }
  }
}

function throwRoomLikeDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P1000', 'P1001', 'P1002'].includes(error.code))
  ) {
    throw new RoomDatabaseUnavailableError({ cause: error });
  }

  throw error;
}
