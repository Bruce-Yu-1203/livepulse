import { describe, expect, it } from 'vitest';

import {
  eventTime,
  lockWindow,
  parseSamplerCsv,
  summarizeGenerator,
  summarizeSamples,
  worstWindowAckP95,
} from './benchmark-pipeline-analysis-core.mjs';
import { samplerColumns } from './benchmark-pipeline-sampler-core.mjs';

const csv = [
  samplerColumns.join(','),
  '1000,t0,10,1,5,0,0,0,0,',
  '2000,t1,10,1,5,3,1,40,0,fault_start',
  '3000,t2,10,2,6,4,1,90,1,',
  '4000,t3,60,1,5,0,0,30,0,fault_end',
  '5000,t4,100,1,5,0,0,0,0,"a,b"',
].join('\n');

function generator(overrides = {}) {
  return {
    settings: {
      plannedMessages: 4,
      messagePipeline: 'kafka',
      connections: 2,
      messagesPerSecond: 2,
      durationSeconds: 2,
    },
    windowStartedAtEpochMs: 500,
    acceptedMessages: 3,
    failures: 1,
    errorCounts: { ack_timeout: 1 },
    failedMessageIndexes: [3],
    endToEndAckMs: { count: 3, p50: 1, p95: 2, p99: 2, max: 2 },
    dispatchLagMs: { p99: 0.5 },
    tenSecondWindows: [
      { sentMessages: 2, endToEndAckMs: { p95: 5 } },
      { sentMessages: 2, endToEndAckMs: { p95: 9 } },
      { sentMessages: 1, endToEndAckMs: { p95: null } },
    ],
    deliveryVerification: {
      expected: 8,
      uniqueReceived: 6,
      missing: 2,
      duplicates: 0,
      wrongRoomDeliveries: 0,
      recipientLatencyMs: { p95: 3 },
    },
    ...overrides,
  };
}

describe('benchmark pipeline analysis', () => {
  it('parses sampler rows with nullable numbers and quoted events', () => {
    const samples = parseSamplerCsv(csv);
    expect(samples).toHaveLength(5);
    expect(samples[1]).toMatchObject({
      epoch_ms: 2000,
      share_lock_held: 1,
      event: 'fault_start',
    });
    expect(samples[4].event).toBe('a,b');
    expect(
      parseSamplerCsv(
        csv.replace('1000,t0,10,1,5,0,0,0,0,', '1000,t0,10,1,5,0,0,,,'),
      )[0],
    ).toMatchObject({
      broadcast_lag: null,
    });
    expect(() => parseSamplerCsv('x,y\n1,2')).toThrow(/header/u);
  });

  it('finds event markers and the observed lock window', () => {
    const samples = parseSamplerCsv(csv);
    expect(eventTime(samples, 'fault_end')).toBe(4000);
    expect(eventTime(samples, 'missing')).toBeNull();
    expect(lockWindow(samples)).toEqual({
      firstSeenMs: 2000,
      lastSeenMs: 3000,
      firstClearMs: 4000,
    });
    expect(lockWindow(samples.slice(0, 1))).toBeNull();
  });

  it('measures drain until backlog returns to the pre-fault baseline', () => {
    const samples = parseSamplerCsv(
      [
        samplerColumns.join(','),
        '1000,t0,10,1,5,0,0,6,0,',
        '2000,t1,20,1,5,0,0,4,0,fault_start',
        '3000,t2,20,1,5,9,1,300,1,',
        '4000,t3,20,2,6,0,0,200,0,fault_end',
        '5000,t4,90,2,6,0,0,20,0,',
        '6000,t5,99,1,5,0,0,5,0,',
      ].join('\n'),
    );
    expect(
      summarizeSamples(samples, { faultStartMs: 2000, faultEndMs: 4000 }),
    ).toEqual({
      samples: 6,
      peakPersistenceLag: 300,
      peakBroadcastLag: 1,
      peakPgActive: 2,
      peakPgTotal: 6,
      peakPgLockWaiters: 9,
      baselinePersistenceLag: 6,
      baselinePgActive: 1,
      persistenceDrainSeconds: 2,
      databaseQueueDrainSeconds: 2,
    });
  });

  it('omits Kafka drain for direct-mode samples', () => {
    const samples = parseSamplerCsv(
      [
        samplerColumns.join(','),
        '1000,t0,10,1,5,0,0,,,',
        '2000,t1,10,11,11,10,1,,,fault_start',
        '4000,t3,10,11,11,0,0,,,fault_end',
        '5000,t4,60,1,5,0,0,,,',
      ].join('\n'),
    );
    expect(
      summarizeSamples(samples, { faultStartMs: 2000, faultEndMs: 4000 }),
    ).toMatchObject({
      peakPersistenceLag: null,
      persistenceDrainSeconds: null,
      databaseQueueDrainSeconds: 1,
    });
  });

  it('counts windows that sent messages but received no ACK', () => {
    expect(worstWindowAckP95(generator())).toEqual({
      worst: 9,
      windowsWithoutAck: 1,
    });
  });

  it('separates lost ACKed messages from failed messages stored anyway', () => {
    const summary = summarizeGenerator(generator(), {
      indexes: new Set([0, 2, 3]),
      duplicateRows: 0,
    });
    expect(summary).toMatchObject({
      planned: 4,
      acked: 3,
      sendSuccessPercent: 75,
      ackedNotPersisted: 1,
      failedButPersisted: 1,
      persisted: 3,
      delivery: { deliveredPercent: 75, missing: 2 },
    });
  });
});
