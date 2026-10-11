import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@livepulse/db';

import { DatabaseService } from '../database/database.service.js';
import {
  RoomDatabaseUnavailableError,
  RoomMuteTargetNotFoundError,
} from './rooms.errors.js';

export interface RoomMuteRecord {
  effectiveAt: Date;
  expiresAt: Date;
  mutedBy: string;
  roomId: string;
  userId: string;
}

export interface RoomMutesRepository {
  mute(input: RoomMuteRecord): Promise<RoomMuteRecord>;
  userExists(userId: string): Promise<boolean>;
}

@Injectable()
export class PrismaRoomMutesRepository implements RoomMutesRepository {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async userExists(userId: string): Promise<boolean> {
    try {
      return (
        (await this.database.client.user.count({ where: { id: userId } })) === 1
      );
    } catch (error) {
      throwRoomMuteDatabaseError(error);
    }
  }

  public async mute(input: RoomMuteRecord): Promise<RoomMuteRecord> {
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const mute = await transaction.roomMute.upsert({
          create: input,
          update: {
            effectiveAt: input.effectiveAt,
            expiresAt: input.expiresAt,
            mutedBy: input.mutedBy,
          },
          where: {
            roomId_userId: { roomId: input.roomId, userId: input.userId },
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'ROOM_USER_MUTED',
            actorId: input.mutedBy,
            createdAt: input.effectiveAt,
            roomId: input.roomId,
            targetId: input.userId,
          },
        });

        return mute;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new RoomMuteTargetNotFoundError({ cause: error });
      }

      throwRoomMuteDatabaseError(error);
    }
  }
}

function throwRoomMuteDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P1000', 'P1001', 'P1002'].includes(error.code))
  ) {
    throw new RoomDatabaseUnavailableError({ cause: error });
  }

  throw error;
}
