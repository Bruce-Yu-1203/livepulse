import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { RoomLifecycleModule } from '../room-lifecycle/room-lifecycle.module.js';
import {
  CachedRealtimeRoomSource,
  DatabaseRealtimeRoomSource,
} from './realtime-room-source.js';
import { RedisRealtimeCoordinator } from './redis-realtime-coordinator.js';
import { ProhibitedContentFilter } from './prohibited-content.filter.js';
import { RealtimeMetricsService } from './realtime-metrics.service.js';
import { RoomRealtimeHub } from './room-realtime-hub.js';
import { RoomSocketIoServer } from './room-socket-io.server.js';
import {
  REALTIME_EVENT_BUS,
  REALTIME_PRESENCE,
  REALTIME_RATE_LIMITER,
  REALTIME_ROOM_SOURCE,
} from './realtime.tokens.js';

@Module({
  imports: [AuthModule, DatabaseModule, MessagesModule, RoomLifecycleModule],
  providers: [
    RoomRealtimeHub,
    RoomSocketIoServer,
    RedisRealtimeCoordinator,
    RealtimeMetricsService,
    DatabaseRealtimeRoomSource,
    CachedRealtimeRoomSource,
    ProhibitedContentFilter,
    {
      provide: REALTIME_ROOM_SOURCE,
      useExisting: CachedRealtimeRoomSource,
    },
    {
      provide: REALTIME_EVENT_BUS,
      useExisting: RedisRealtimeCoordinator,
    },
    {
      provide: REALTIME_PRESENCE,
      useExisting: RedisRealtimeCoordinator,
    },
    {
      provide: REALTIME_RATE_LIMITER,
      useExisting: RedisRealtimeCoordinator,
    },
  ],
  exports: [REALTIME_EVENT_BUS, RealtimeMetricsService, RoomSocketIoServer],
})
export class RealtimeModule {}
