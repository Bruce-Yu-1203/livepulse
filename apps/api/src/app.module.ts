import { Module } from '@nestjs/common';

import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
