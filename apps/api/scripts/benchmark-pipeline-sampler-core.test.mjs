import { describe, expect, it } from 'vitest';

import {
  computeGroupLag,
  formatSampleRow,
  readSamplerConfig,
  samplerColumns,
  takeNewEvents,
} from './benchmark-pipeline-sampler-core.mjs';

const databaseUrl =
  'postgresql://user:pass@127.0.0.1:5432/livepulse_benchmark_sampler';

describe('benchmark pipeline sampler', () => {
  it('accepts a direct-mode database without Kafka', () => {
    expect(readSamplerConfig({ DATABASE_URL: databaseUrl })).toEqual({
      databaseUrl,
      intervalMs: 1000,
      kafka: null,
      eventsFile: null,
    });
  });

  it('requires topic and group names when sampling Kafka lag', () => {
    const environment = {
      DATABASE_URL: databaseUrl,
      KAFKA_BROKERS: 'localhost:9094',
      KAFKA_MESSAGES_TOPIC: 'bench.topic',
      KAFKA_BROADCAST_GROUP: 'bench-broadcast',
      KAFKA_PERSISTENCE_GROUP: 'bench-persist',
      BENCHMARK_SAMPLER_EVENTS_FILE: '/tmp/events',
    };
    expect(readSamplerConfig(environment).kafka).toEqual({
      brokers: ['localhost:9094'],
      topic: 'bench.topic',
      broadcastGroup: 'bench-broadcast',
      persistenceGroup: 'bench-persist',
    });
    expect(() =>
      readSamplerConfig({ ...environment, KAFKA_PERSISTENCE_GROUP: '' }),
    ).toThrow(/KAFKA_PERSISTENCE_GROUP is required/u);
  });

  it('rejects remote or non-benchmark targets', () => {
    expect(() =>
      readSamplerConfig({
        DATABASE_URL:
          'postgresql://user:pass@127.0.0.1:5432/livepulse?schema=public',
      }),
    ).toThrow(/livepulse_benchmark_/u);
    expect(() =>
      readSamplerConfig({
        DATABASE_URL: databaseUrl.replace('127.0.0.1', 'db.example'),
      }),
    ).toThrow(/livepulse_benchmark_/u);
    expect(() =>
      readSamplerConfig({
        DATABASE_URL: databaseUrl,
        KAFKA_BROKERS: 'kafka.example:9092',
      }),
    ).toThrow(/must be local/u);
    expect(() =>
      readSamplerConfig({
        DATABASE_URL: databaseUrl,
        BENCHMARK_SAMPLER_INTERVAL_MS: '10',
      }),
    ).toThrow(/at least 100/u);
  });

  it('sums lag and counts uncommitted partitions from the low watermark', () => {
    const topicOffsets = [
      { partition: 0, offset: '120', high: '120', low: '0' },
      { partition: 1, offset: '50', high: '50', low: '10' },
      { partition: 2, offset: '7', high: '7', low: '0' },
    ];
    expect(
      computeGroupLag(topicOffsets, [
        { partition: 0, offset: '100' },
        { partition: 1, offset: '-1' },
        { partition: 2, offset: '7' },
      ]),
    ).toBe(20 + 40 + 0);
    expect(computeGroupLag(topicOffsets, [])).toBe(120 + 40 + 7);
  });

  it('returns only marker lines appended since the previous sample', () => {
    const first = takeNewEvents('fault_start\n', 0);
    expect(first).toEqual({ events: ['fault_start'], consumedLines: 1 });
    const second = takeNewEvents(
      'fault_start\nfault_end\n\n',
      first.consumedLines,
    );
    expect(second).toEqual({ events: ['fault_end'], consumedLines: 2 });
    expect(takeNewEvents('', 2)).toEqual({ events: [], consumedLines: 2 });
  });

  it('formats rows in column order and quotes unsafe text', () => {
    const row = formatSampleRow({
      epoch_ms: 1,
      iso_time: '1970-01-01T00:00:00.001Z',
      danmaku_rows: 5,
      pg_active: 2,
      pg_total: 9,
      pg_lock_waiters: 0,
      share_lock_held: 1,
      persistence_lag: null,
      broadcast_lag: undefined,
      event: 'burst_start,"b"',
    });
    expect(row).toBe(
      '1,1970-01-01T00:00:00.001Z,5,2,9,0,1,,,"burst_start,""b"""',
    );
    expect(row.split(',').length).toBeGreaterThanOrEqual(samplerColumns.length);
  });
});
