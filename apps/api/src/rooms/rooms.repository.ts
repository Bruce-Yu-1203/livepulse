import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateRoomRequest,
  RoomCategory,
  RoomStatus,
  UpdateRoomRequest,
} from '@livepulse/contracts';
import { toRoomCategory } from '@livepulse/contracts';
import { Prisma } from '@livepulse/db';

import { DatabaseService } from '../database/database.service.js';
import {
  RoomAlreadyLiveError,
  RoomDatabaseUnavailableError,
  RoomHostNotFoundError,
} from './rooms.errors.js';
import type { RoomCursor } from './room-cursor.js';

export interface RoomRecord extends Omit<
  CreateRoomRequest,
  'category' | 'coverImageUrl'
> {
  category: RoomCategory;
  coverImageUrl: string | null;
  createdAt: Date;
  hostId: string;
  id: string;
  likeCount: number;
  status: RoomStatus;
  startedAt?: Date | null;
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
  deleteDraft(id: string, expectedVersion: number): Promise<boolean>;
  findById(id: string): Promise<RoomRecord | undefined>;
  findVisibleById(id: string): Promise<VisibleRoomRecord | undefined>;
  listOwned(hostId: string): Promise<RoomRecord[]>;
  findCurrent(hostId: string): Promise<RoomRecord | undefined>;
  listHistory(input: {
    cursor: RoomCursor | undefined;
    from: Date | undefined;
    hostId: string;
    query: string | undefined;
    take: number;
    to: Date | undefined;
  }): Promise<RoomRecord[]>;
  listVisible(input: {
    category?: RoomCategory | undefined;
    cursor: RoomCursor | undefined;
    hostId: string | undefined;
    query: string | undefined;
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
          ...(input.category ? { category: input.category } : {}),
          coverImageUrl: input.coverImageUrl ?? null,
          description: input.description,
          hostId: input.hostId,
          status: 'DRAFT',
          title: input.title,
        },
        include: { _count: { select: { likes: true } } },
      });

      return {
        ...withLikeCount(room),
        status: 'DRAFT',
      };
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

  public async deleteDraft(
    id: string,
    expectedVersion: number,
  ): Promise<boolean> {
    try {
      const result = await this.database.client.room.deleteMany({
        where: { id, status: 'DRAFT', version: expectedVersion },
      });
      return result.count === 1;
    } catch (error) {
      throwRoomDatabaseError(error);
    }
  }

  public async listVisible(input: {
    category?: RoomCategory | undefined;
    cursor: RoomCursor | undefined;
    hostId: string | undefined;
    query: string | undefined;
    take: number;
  }): Promise<VisibleRoomRecord[]> {
    try {
      const query = input.query ? escapeLikePattern(input.query) : undefined;
      const rooms = await this.database.client.room.findMany({
        include: { _count: { select: { likes: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.take,
        where: {
          ...(input.category ? { category: input.category } : {}),
          ...(input.hostId ? { hostId: input.hostId } : {}),
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
          ...(query
            ? {
                AND: {
                  OR: [
                    { title: { contains: query, mode: 'insensitive' } },
                    { description: { contains: query, mode: 'insensitive' } },
                  ],
                },
              }
            : {}),
          status: { in: ['LIVE', 'ENDED'] },
        },
      });

      return rooms.map((room) => ({
        ...withLikeCount(room),
        status: room.status as VisibleRoomRecord['status'],
      }));
    } catch (error) {
      throwRoomDatabaseError(error);
    }
  }

  public async listOwned(hostId: string): Promise<RoomRecord[]> {
    try {
      const rooms = await this.database.client.room.findMany({
        include: { _count: { select: { likes: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: { hostId },
      });

      return rooms.map(withLikeCount);
    } catch (error) {
      throwRoomDatabaseError(error);
    }
  }

  public async findCurrent(hostId: string): Promise<RoomRecord | undefined> {
    try {
      const room = await this.database.client.room.findFirst({
        include: { _count: { select: { likes: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: { hostId, status: 'LIVE' },
      });
      return room ? withLikeCount(room) : undefined;
    } catch (error) {
      throwRoomDatabaseError(error);
    }
  }

  public async listHistory(input: {
    cursor: RoomCursor | undefined;
    from: Date | undefined;
    hostId: string;
    query: string | undefined;
    take: number;
    to: Date | undefined;
  }): Promise<RoomRecord[]> {
    try {
      const query = input.query ? escapeLikePattern(input.query) : undefined;
      const rooms = await this.database.client.room.findMany({
        include: { _count: { select: { likes: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.take,
        where: {
          hostId: input.hostId,
          status: 'ENDED',
          ...(query ? { title: { contains: query, mode: 'insensitive' } } : {}),
          ...(input.from || input.to
            ? {
                createdAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lt: input.to } : {}),
                },
              }
            : {}),
          ...(input.cursor
            ? {
                AND: [
                  {
                    OR: [
                      { createdAt: { lt: input.cursor.createdAt } },
                      {
                        createdAt: input.cursor.createdAt,
                        id: { lt: input.cursor.id },
                      },
                    ],
                  },
                ],
              }
            : {}),
        },
      });
      return rooms.map(withLikeCount);
    } catch (error) {
      throwRoomDatabaseError(error);
    }
  }

  public async findById(id: string): Promise<RoomRecord | undefined> {
    try {
      const room = await this.database.client.room.findUnique({
        include: { _count: { select: { likes: true } } },
        where: { id },
      });

      return room ? withLikeCount(room) : undefined;
    } catch (error) {
      throwRoomDatabaseError(error);
    }
  }

  public async findVisibleById(
    id: string,
  ): Promise<VisibleRoomRecord | undefined> {
    try {
      const room = await this.database.client.room.findFirst({
        include: { _count: { select: { likes: true } } },
        where: {
          id,
          status: { in: ['LIVE', 'ENDED'] },
        },
      });

      return room
        ? {
            ...withLikeCount(room),
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
      const updateRoom = (client: Prisma.TransactionClient) =>
        client.room.update({
          data: {
            ...(input.changes.category === undefined
              ? {}
              : { category: input.changes.category }),
            ...(input.changes.coverImageUrl === undefined
              ? {}
              : { coverImageUrl: input.changes.coverImageUrl }),
            ...(input.changes.description === undefined
              ? {}
              : { description: input.changes.description }),
            ...(input.changes.status === undefined
              ? {}
              : {
                  status: input.changes.status,
                  ...(input.changes.status === 'LIVE'
                    ? { startedAt: new Date() }
                    : {}),
                }),
            ...(input.changes.title === undefined
              ? {}
              : { title: input.changes.title }),
            version: { increment: 1 },
          },
          include: { _count: { select: { likes: true } } },
          where: {
            id: input.id,
            version: input.expectedVersion,
          },
        });

      const room =
        input.changes.status === 'LIVE'
          ? await this.database.client.$transaction(async (client) => {
              const current = await client.room.findUnique({
                select: { hostId: true },
                where: { id: input.id },
              });
              if (!current) {
                return undefined;
              }
              await client.$queryRaw`SELECT id FROM users WHERE id = ${current.hostId}::uuid FOR UPDATE`;
              const active = await client.room.findFirst({
                select: { id: true },
                where: {
                  hostId: current.hostId,
                  id: { not: input.id },
                  status: 'LIVE',
                },
              });
              if (active) {
                throw new RoomAlreadyLiveError();
              }
              return updateRoom(client);
            })
          : await updateRoom(this.database.client);

      return room ? withLikeCount(room) : undefined;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return undefined;
      }
      // The partial unique index is the backstop for one live room per host.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new RoomAlreadyLiveError();
      }

      throwRoomDatabaseError(error);
    }
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, '\\$&');
}

function withLikeCount<
  T extends { _count: { likes: number }; category: string },
>(room: T) {
  const { _count, ...record } = room;

  return {
    ...record,
    category: toRoomCategory(record.category),
    likeCount: _count.likes,
  };
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
