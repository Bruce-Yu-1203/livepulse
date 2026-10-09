import { Inject, Injectable } from '@nestjs/common';
import type { CreateRoomRequest } from '@livepulse/contracts';
import { Prisma } from '@livepulse/db';

import { DatabaseService } from '../database/database.service.js';
import {
  RoomDatabaseUnavailableError,
  RoomHostNotFoundError,
} from './rooms.errors.js';

export interface CreatedRoom extends CreateRoomRequest {
  createdAt: Date;
  hostId: string;
  id: string;
  status: 'DRAFT';
  updatedAt: Date;
}

export interface CreateRoomRecord extends CreateRoomRequest {
  hostId: string;
}

export interface RoomsRepository {
  create(input: CreateRoomRecord): Promise<CreatedRoom>;
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
}
