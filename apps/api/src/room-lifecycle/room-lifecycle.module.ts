import { Module } from '@nestjs/common';

import { RoomLifecycleEvents } from './room-lifecycle.events.js';

@Module({
  exports: [RoomLifecycleEvents],
  providers: [RoomLifecycleEvents],
})
export class RoomLifecycleModule {}
