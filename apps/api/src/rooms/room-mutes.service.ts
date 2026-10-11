import { Inject, Injectable } from '@nestjs/common';
import type { MuteRoomUserRequest } from '@livepulse/contracts';

import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';
import type {
  RoomMuteRecord,
  RoomMutesRepository,
} from './room-mutes.repository.js';
import { ROOM_MUTES_REPOSITORY } from './room-mutes.tokens.js';
import {
  RoomForbiddenError,
  RoomMuteSelfError,
  RoomMuteTargetNotFoundError,
  RoomNotFoundError,
} from './rooms.errors.js';
import type { RoomsRepository } from './rooms.repository.js';
import { ROOMS_REPOSITORY } from './rooms.tokens.js';

@Injectable()
export class RoomMutesService {
  public constructor(
    @Inject(ROOM_MUTES_REPOSITORY)
    private readonly mutes: RoomMutesRepository,
    @Inject(ROOMS_REPOSITORY) private readonly rooms: RoomsRepository,
  ) {}

  public async mute(
    actor: AuthenticatedPrincipal,
    roomId: string,
    input: MuteRoomUserRequest,
  ): Promise<RoomMuteRecord> {
    const room = await this.rooms.findById(roomId);

    if (!room) {
      throw new RoomNotFoundError();
    }

    if (actor.role !== 'ADMIN' && room.hostId !== actor.userId) {
      throw new RoomForbiddenError();
    }

    if (input.userId === actor.userId) {
      throw new RoomMuteSelfError();
    }

    if (!(await this.mutes.userExists(input.userId))) {
      throw new RoomMuteTargetNotFoundError();
    }

    const effectiveAt = new Date();
    const expiresAt = new Date(
      effectiveAt.getTime() + input.durationMinutes * 60_000,
    );

    return this.mutes.mute({
      effectiveAt,
      expiresAt,
      mutedBy: actor.userId,
      roomId,
      userId: input.userId,
    });
  }
}
