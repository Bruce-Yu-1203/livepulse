import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@livepulse/contracts';

import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  public constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Get('live')
  public getLiveness(): HealthResponse {
    return this.healthService.getStatus();
  }

  @Get('ready')
  public getReadiness(): HealthResponse {
    return this.healthService.getStatus();
  }
}
