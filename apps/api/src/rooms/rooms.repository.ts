import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateRoomRequest,
  RoomStatus,
  UpdateRoomRequest,
} from '@livepulse/contracts';
import { Prisma } from '@livepulse/db';

import { DatabaseService } from '../database/database.service.js';
import {
  RoomDatabaseUnavailableError,
  RoomHostNotFoundError,
} from './rooms.errors.js';
import type { RoomCursor } from './room-cursor.js';

export interface RoomRecord extends CreateRoomRequest {
  createdAt: Date;
  hostId: string;
  id: string;
  status: RoomStatus;
  updatedAt: Date;
  version: number;
}

export interface CreatedRoom extends RoomRecord {
  status: 'DRAFT';
}

export interface VisibleRoomRecord extends RoomRecord {
  status: 'ENDED' | 'LIVE';
}

export interface CreateRoomRecord extends CreateRoomRequest {
  hostId: string;
}

export interface RoomsRepository {
  create(input: CreateRoomRecord): Promise<CreatedRoom>;
  findById(id: string): Promise<RoomRecord | undefined>;
  findVisibleById(id: string): Promise<VisibleRoomRecord | undefined>;
  listOwned(hostId: string): Promise<RoomRecord[]>;
  listVisible(input: {
    cursor: RoomCursor | undefined;
    take: number;
  }): Promise<VisibleRoomRecord[]>;
  update(input: {
    changes: Omit<UpdateRoomRequest, 'expectedVersion'>;
    expectedVersion: number;
    id: string;
  }): Promise<RoomRecord | undefined>;
}

@Injectable()
export class PrismaRoomsRepository implements RoomsRepository {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async create(input: CreateRoomRecord): Promise<CreatedRoom> {
    try {
      const room = await this.database.client.room.create({
        data: {
          coverImageUrl: input.coverImageUrl,
          demoVideoUrl: input.demoVideoUrl,
          description: input.description,
          hostId: input.hostId,
          status: 'DRAFT',
          title: input.title,
        },
      });

      return { ...room, status: 'DRAFT' };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new RoomHostNotFoundError({ cause: error });
      }

      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P1000', 'P1001', 'P1002'].includes(error.code))
      ) {
        throw new RoomDatabaseUnavailableError({ cause: error });
      }

      throw error;
    }
  }

  public async listVisible(input: {
    cursor: RoomCursor | undefined;
    take: number;
  }): Promise<VisibleRoomRecord[]> {
    try {
      const rooms = await this.database.client.room.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.take,
        where: {
          ...(input.cursor
            ? {
                OR: [
                  { createdAt: { lt: input.cursor.createdAt } },
                  {
                    createdAt: input.cursor.createdAt,
                    id: { lt: input.cursor.id },
                  },
                ],
              }
            : {}),
          status: { in: ['LIVE', 'ENDED'] },
        },
      });

      return rooms.map((room) => ({
        ...room,
        status: room.status as VisibleRoomRecord['status'],
      }));
    } catch (error) {
      throwRoomDatabaseError(error);
    }
  }

  public async listOwned(hostId: string): Promise<RoomRecord[]> {
    try {
      return await this.database.client.room.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: { hostId },
      });
    } catch (error) {
      throwRoomDatabaseError(error);
    }
  }

  public async findById(id: string): Promise<RoomRecord | undefined> {
    try {
      return (
        (await this.database.client.room.findUnique({ where: { id } })) ??
        undefined
      );
    } catch (error) {
      throwRoomDatabaseError(error);
    }
  }

  public async findVisibleById(
    id: string,
  ): Promise<VisibleRoomRecord | undefined> {
    try {
      const room = await this.database.client.room.findFirst({
        where: {
          id,
          status: { in: ['LIVE', 'ENDED'] },
        },
      });

      return room
        ? {
            ...room,
            status: room.status as VisibleRoomRecord['status'],
          }
        : undefined;
    } catch (error) {
      throwRoomDatabaseError(error);
    }
  }

  public async update(input: {
    changes: Omit<UpdateRoomRequest, 'expectedVersion'>;
    expectedVersion: number;
    id: string;
  }): Promise<RoomRecord | undefined> {
    try {
      return await this.database.client.room.update({
        data: {
          ...(input.changes.coverImageUrl === undefined
            ? {}
            : { coverImageUrl: input.changes.coverImageUrl }),
          ...(input.changes.demoVideoUrl === undefined
            ? {}
            : { demoVideoUrl: input.changes.demoVideoUrl }),
          ...(input.changes.description === undefined
            ? {}
            : { description: input.changes.description }),
          ...(input.changes.status === undefined
            ? {}
            : { status: input.changes.status }),
          ...(input.changes.title === undefined
            ? {}
            : { title: input.changes.title }),
          version: { increment: 1 },
        },
        where: {
          id: input.id,
          version: input.expectedVersion,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return undefined;
      }

      throwRoomDatabaseError(error);
    }
  }
}

function throwRoomDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P1000', 'P1001', 'P1002'].includes(error.code))
  ) {
    throw new RoomDatabaseUnavailableError({ cause: error });
  }

  throw error;
}
