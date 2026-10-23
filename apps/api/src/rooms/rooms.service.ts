import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateRoomRequest,
  ListBroadcastHistoryQuery,
  ListRoomsQuery,
  UpdateRoomRequest,
} from '@livepulse/contracts';

import { RoomLifecycleEvents } from '../room-lifecycle/room-lifecycle.events.js';
import type { RoomLifecyclePublisher } from '../room-lifecycle/room-lifecycle.events.js';
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
    @Inject(RoomLifecycleEvents)
    private readonly roomLifecycle: RoomLifecyclePublisher,
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
      hostId: query.hostId,
      query: query.q,
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

  public findCurrent(hostId: string) {
    return this.rooms.findCurrent(hostId);
  }

  public async listHistory(hostId: string, query: ListBroadcastHistoryQuery) {
    const cursor = query.cursor
      ? this.cursorCodec.decode(query.cursor)
      : undefined;
    const records = await this.rooms.listHistory({
      cursor,
      from: query.from ? new Date(query.from) : undefined,
      hostId,
      query: query.q,
      take: query.limit + 1,
      to: query.to ? new Date(query.to) : undefined,
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

  public async getManageable(
    actor: { role: 'ADMIN' | 'HOST' | 'VIEWER'; userId: string },
    id: string,
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

    return room;
  }

  public async deleteDraft(
    actor: { role: 'ADMIN' | 'HOST' | 'VIEWER'; userId: string },
    id: string,
  ): Promise<void> {
    const room = await this.getManageable(actor, id);
    if (room.status !== 'DRAFT') {
      throw new InvalidRoomTransitionError();
    }
    if (!(await this.rooms.deleteDraft(id, room.version))) {
      throw new RoomVersionConflictError();
    }
  }

  public async update(
    actor: { role: 'ADMIN' | 'HOST' | 'VIEWER'; userId: string },
    id: string,
    input: UpdateRoomRequest,
  ) {
    const room = await this.getManageable(actor, id);

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

    if (room.status === 'LIVE' && updated.status === 'ENDED') {
      await this.roomLifecycle.publishRoomEnded({
        endedAt: updated.updatedAt,
        roomId: updated.id,
      });
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
