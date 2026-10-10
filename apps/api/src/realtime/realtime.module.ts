import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { DatabaseRealtimeRoomSource } from './realtime-room-source.js';
import { RedisRealtimeCoordinator } from './redis-realtime-coordinator.js';
import { RoomRealtimeHub } from './room-realtime-hub.js';
import { RoomWebSocketServer } from './room-websocket.server.js';
import {
  REALTIME_EVENT_BUS,
  REALTIME_PRESENCE,
  REALTIME_ROOM_SOURCE,
} from './realtime.tokens.js';

@Module({
  imports: [AuthModule, DatabaseModule, MessagesModule],
  providers: [
    RoomRealtimeHub,
    RoomWebSocketServer,
    RedisRealtimeCoordinator,
    {
      provide: REALTIME_ROOM_SOURCE,
      useClass: DatabaseRealtimeRoomSource,
    },
    {
      provide: REALTIME_EVENT_BUS,
      useExisting: RedisRealtimeCoordinator,
    },
    {
      provide: REALTIME_PRESENCE,
      useExisting: RedisRealtimeCoordinator,
    },
  ],
  exports: [RoomWebSocketServer],
})
export class RealtimeModule {}
