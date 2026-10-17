import { describe, expect, it } from 'vitest';

import { OperationsSummaryResponseSchema } from './operations.js';

describe('operations contracts', () => {
  it('accepts a non-sensitive admin operations summary', () => {
    const response = {
      business: {
        auditActions: 8,
        liveRooms: 2,
        pendingReports: 1,
        users: 14,
      },
      generatedAt: '2026-10-16T20:01:00.000Z',
      requestId: 'request-1',
      runtime: {
        acceptedMessages: 120,
        acceptedMessagesLastMinute: 9,
        activeConnections: 4,
        deliveryAttempts: 480,
        redisFailures: 0,
        startedAt: '2026-10-16T20:00:00.000Z',
      },
    };

    expect(OperationsSummaryResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects negative counters and unknown fields', () => {
    expect(
      OperationsSummaryResponseSchema.safeParse({
        business: {
          auditActions: 0,
          liveRooms: 0,
          pendingReports: -1,
          users: 0,
        },
        generatedAt: '2026-10-16T20:01:00.000Z',
        requestId: 'request-1',
        runtime: {
          acceptedMessages: 0,
          acceptedMessagesLastMinute: 0,
          activeConnections: 0,
          deliveryAttempts: 0,
          redisFailures: 0,
          startedAt: '2026-10-16T20:00:00.000Z',
        },
      }).success,
    ).toBe(false);
  });
});
