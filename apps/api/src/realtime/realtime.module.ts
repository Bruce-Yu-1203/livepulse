import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { DatabaseRealtimeRoomSource } from './realtime-room-source.js';
import { RoomRealtimeHub } from './room-realtime-hub.js';
import { RoomWebSocketServer } from './room-websocket.server.js';
import { REALTIME_ROOM_SOURCE } from './realtime.tokens.js';

@Module({
  imports: [AuthModule, DatabaseModule, MessagesModule],
  providers: [
    RoomRealtimeHub,
    RoomWebSocketServer,
    {
      provide: REALTIME_ROOM_SOURCE,
      useClass: DatabaseRealtimeRoomSource,
    },
  ],
  exports: [RoomWebSocketServer],
})
export class RealtimeModule {}
