import { Inject, Injectable } from '@nestjs/common';
import type { CreateRoomRequest } from '@livepulse/contracts';

import { ROOMS_REPOSITORY } from './rooms.tokens.js';
import type { CreatedRoom, RoomsRepository } from './rooms.repository.js';

@Injectable()
export class RoomsService {
  public constructor(
    @Inject(ROOMS_REPOSITORY) private readonly rooms: RoomsRepository,
  ) {}

  public create(
    hostId: string,
    input: CreateRoomRequest,
  ): Promise<CreatedRoom> {
    return this.rooms.create({ ...input, hostId });
  }
}
