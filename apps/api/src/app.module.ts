import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RoomsModule } from './rooms/rooms.module.js';

@Module({
  controllers: [HealthController],
  imports: [AuthModule, RealtimeModule, RoomsModule],
  providers: [HealthService],
})
export class AppModule {}
