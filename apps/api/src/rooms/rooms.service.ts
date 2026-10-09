import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateRoomRequest,
  ListRoomsQuery,
  UpdateRoomRequest,
} from '@livepulse/contracts';

import { RoomCursorCodec } from './room-cursor.js';
import {
  InvalidRoomTransitionError,
  RoomForbiddenError,
  RoomNotFoundError,
  RoomVersionConflictError,
} from './rooms.errors.js';
import { ROOMS_REPOSITORY } from './rooms.tokens.js';
import type {
  CreatedRoom,
  RoomsRepository,
  VisibleRoomRecord,
} from './rooms.repository.js';

@Injectable()
export class RoomsService {
  private readonly cursorCodec = new RoomCursorCodec();

  public constructor(
    @Inject(ROOMS_REPOSITORY) private readonly rooms: RoomsRepository,
  ) {}

  public create(
    hostId: string,
    input: CreateRoomRequest,
  ): Promise<CreatedRoom> {
    return this.rooms.create({ ...input, hostId });
  }

  public async list(query: ListRoomsQuery): Promise<{
    items: VisibleRoomRecord[];
    nextCursor: string | null;
  }> {
    const cursor = query.cursor
      ? this.cursorCodec.decode(query.cursor)
      : undefined;
    const records = await this.rooms.listVisible({
      cursor,
      take: query.limit + 1,
    });
    const hasNextPage = records.length > query.limit;
    const items = hasNextPage ? records.slice(0, query.limit) : records;
    const lastItem = items.at(-1);

    return {
      items,
      nextCursor:
        hasNextPage && lastItem
          ? this.cursorCodec.encode({
              createdAt: lastItem.createdAt,
              id: lastItem.id,
            })
          : null,
    };
  }

  public async getVisible(id: string): Promise<VisibleRoomRecord> {
    const room = await this.rooms.findVisibleById(id);

    if (!room) {
      throw new RoomNotFoundError();
    }

    return room;
  }

  public listOwned(hostId: string) {
    return this.rooms.listOwned(hostId);
  }

  public async update(
    actor: { role: 'ADMIN' | 'HOST' | 'VIEWER'; userId: string },
    id: string,
    input: UpdateRoomRequest,
  ) {
    const room = await this.rooms.findById(id);

    if (!room) {
      throw new RoomNotFoundError();
    }

    if (
      actor.role === 'VIEWER' ||
      (actor.role !== 'ADMIN' && room.hostId !== actor.userId)
    ) {
      throw new RoomForbiddenError();
    }

    if (room.version !== input.expectedVersion) {
      throw new RoomVersionConflictError();
    }

    if (
      room.status === 'ENDED' ||
      (input.status !== undefined &&
        !isAllowedTransition(room.status, input.status))
    ) {
      throw new InvalidRoomTransitionError();
    }

    const { expectedVersion, ...changes } = input;
    const updated = await this.rooms.update({
      changes,
      expectedVersion,
      id,
    });

    if (!updated) {
      throw new RoomVersionConflictError();
    }

    return updated;
  }
}

function isAllowedTransition(
  current: 'DRAFT' | 'ENDED' | 'LIVE',
  next: 'DRAFT' | 'ENDED' | 'LIVE',
): boolean {
  return (
    (current === 'DRAFT' && next === 'LIVE') ||
    (current === 'LIVE' && next === 'ENDED')
  );
}
