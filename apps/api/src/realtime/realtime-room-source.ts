import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

export interface RealtimeRoomSource {
  findActiveMuteExpiry(roomId: string, userId: string): Promise<Date | null>;
  isLive(roomId: string): Promise<boolean>;
}

@Injectable()
export class DatabaseRealtimeRoomSource implements RealtimeRoomSource {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async isLive(roomId: string): Promise<boolean> {
    const room = await this.database.client.room.findUnique({
      select: { status: true },
      where: { id: roomId },
    });

    return room?.status === 'LIVE';
  }

  public async findActiveMuteExpiry(
    roomId: string,
    userId: string,
  ): Promise<Date | null> {
    const now = new Date();
    const mute = await this.database.client.roomMute.findUnique({
      select: { effectiveAt: true, expiresAt: true },
      where: { roomId_userId: { roomId, userId } },
    });

    if (!mute || mute.effectiveAt > now || mute.expiresAt <= now) {
      return null;
    }

    return mute.expiresAt;
  }
}
