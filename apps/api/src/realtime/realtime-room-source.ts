import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

export interface RealtimeRoomSource {
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
}
