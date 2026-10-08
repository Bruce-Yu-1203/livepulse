import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@livepulse/contracts';

@Injectable()
export class HealthService {
  public getStatus(): HealthResponse {
    return {
      service: 'api',
      status: 'ok',
    };
  }
}
