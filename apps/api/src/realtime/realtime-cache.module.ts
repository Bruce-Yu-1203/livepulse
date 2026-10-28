import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { RealtimeMetricsService } from './realtime-metrics.service.js';
import { RedisMuteStore } from './redis-mute-store.js';
import { RoomMuteCache } from './room-mute-cache.js';

@Module({
  exports: [RealtimeMetricsService, RoomMuteCache],
  imports: [DatabaseModule],
  providers: [RealtimeMetricsService, RedisMuteStore, RoomMuteCache],
})
export class RealtimeCacheModule {}
