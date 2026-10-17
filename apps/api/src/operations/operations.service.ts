import { Inject, Injectable } from '@nestjs/common';
import type { OperationsSummaryResponse } from '@livepulse/contracts';

import { DatabaseService } from '../database/database.service.js';
import { RealtimeMetricsService } from '../realtime/realtime-metrics.service.js';

export type OperationsSummary = Omit<
  OperationsSummaryResponse,
  'generatedAt' | 'requestId'
>;

@Injectable()
export class OperationsService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(RealtimeMetricsService)
    private readonly realtimeMetrics: RealtimeMetricsService,
  ) {}

  public async getSummary(): Promise<OperationsSummary> {
    const [users, liveRooms, pendingReports, auditActions] = await Promise.all([
      this.database.client.user.count(),
      this.database.client.room.count({ where: { status: 'LIVE' } }),
      this.database.client.report.count({ where: { status: 'PENDING' } }),
      this.database.client.auditLog.count(),
    ]);

    return {
      business: { auditActions, liveRooms, pendingReports, users },
      runtime: this.realtimeMetrics.snapshot(),
    };
  }
}
