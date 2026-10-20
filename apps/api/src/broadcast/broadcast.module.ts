import { Module } from '@nestjs/common';

import { BroadcastService } from './broadcast.service.js';

@Module({
  exports: [BroadcastService],
  providers: [BroadcastService],
})
export class BroadcastModule {}
