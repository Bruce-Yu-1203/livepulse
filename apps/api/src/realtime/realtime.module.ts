import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { RoomLifecycleModule } from '../room-lifecycle/room-lifecycle.module.js';
import { DatabaseRealtimeRoomSource } from './realtime-room-source.js';
import { RedisRealtimeCoordinator } from './redis-realtime-coordinator.js';
import { ProhibitedContentFilter } from './prohibited-content.filter.js';
import { RealtimeMetricsService } from './realtime-metrics.service.js';
import { RoomRealtimeHub } from './room-realtime-hub.js';
import { RoomSocketIoServer } from './room-socket-io.server.js';
import {
  REALTIME_EVENT_BUS,
  REALTIME_PRESENCE,
  REALTIME_ROOM_SOURCE,
} from './realtime.tokens.js';

@Module({
  imports: [AuthModule, DatabaseModule, MessagesModule, RoomLifecycleModule],
  providers: [
    RoomRealtimeHub,
    RoomSocketIoServer,
    RedisRealtimeCoordinator,
    RealtimeMetricsService,
    ProhibitedContentFilter,
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
  exports: [REALTIME_EVENT_BUS, RealtimeMetricsService, RoomSocketIoServer],
})
export class RealtimeModule {}
