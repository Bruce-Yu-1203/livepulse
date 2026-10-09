import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';

@Module({
  controllers: [HealthController],
  imports: [AuthModule],
  providers: [HealthService],
})
export class AppModule {}
