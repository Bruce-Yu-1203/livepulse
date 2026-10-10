import { Inject, Injectable } from '@nestjs/common';

import { ROOM_LIKES_REPOSITORY } from './room-likes.tokens.js';
import type {
  RoomLikeSummary,
  RoomLikesRepository,
} from './room-likes.repository.js';
import { RoomNotFoundError } from './rooms.errors.js';

@Injectable()
export class RoomLikesService {
  public constructor(
    @Inject(ROOM_LIKES_REPOSITORY)
    private readonly likes: RoomLikesRepository,
  ) {}

  public async get(roomId: string, userId: string): Promise<RoomLikeSummary> {
    return this.requireVisibleRoom(await this.likes.get(roomId, userId));
  }

  public async setLiked(
    roomId: string,
    userId: string,
    liked: boolean,
  ): Promise<RoomLikeSummary> {
    return this.requireVisibleRoom(
      await this.likes.setLiked(roomId, userId, liked),
    );
  }

  private requireVisibleRoom(
    summary: RoomLikeSummary | undefined,
  ): RoomLikeSummary {
    if (!summary) {
      throw new RoomNotFoundError();
    }

    return summary;
  }
}
