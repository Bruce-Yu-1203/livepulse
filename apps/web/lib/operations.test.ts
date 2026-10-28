import type { OperationsSummaryResponse } from '@livepulse/contracts';
import { describe, expect, it } from 'vitest';

import { operationMetricCards } from './operations';

const summary: OperationsSummaryResponse = {
  business: {
    auditActions: 8,
    liveRooms: 2,
    pendingReports: 1,
    users: 14,
  },
  generatedAt: '2026-10-16T20:01:00.000Z',
  requestId: 'request-1',
  runtime: {
    acceptedMessages: 1_200,
    acceptedMessagesLastMinute: 9,
    activeConnections: 4,
    deliveryAttempts: 12_500,
    redisFailures: 1,
    sessionCacheHits: 0,
    sessionRefreshes: 0,
    roomCacheHits: 0,
    roomCacheMisses: 0,
    muteCacheHits: 0,
    muteCacheMisses: 0,
    muteDbFallbacks: 0,
    muteInvalidationFailures: 0,
    startedAt: '2026-10-16T20:00:00.000Z',
  },
};

describe('operations presentation', () => {
  it('turns runtime counters into readable dashboard cards', () => {
    expect(operationMetricCards(summary)).toEqual([
      expect.objectContaining({ label: 'Connections', value: '4' }),
      expect.objectContaining({
        detail: '1,200 accepted since startup',
        label: 'Messages / min',
        value: '9',
      }),
      expect.objectContaining({ label: 'Deliveries', value: '12,500' }),
      expect.objectContaining({ label: 'Redis failures', value: '1' }),
    ]);
  });
});
