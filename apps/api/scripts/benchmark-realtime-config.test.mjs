import { describe, expect, it } from 'vitest';

import { readBenchmarkConfig } from './benchmark-realtime-config.mjs';

const localEnvironment = {
  DATABASE_URL:
    'postgresql://user:pass@127.0.0.1:5432/livepulse_benchmark_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  REDIS_KEY_PREFIX: 'livepulse-benchmark-test',
  DEMO_PASSWORD: 'example password',
};

describe('local realtime benchmark configuration', () => {
  it('accepts an isolated local workload', () => {
    const config = readBenchmarkConfig({
      ...localEnvironment,
      BENCHMARK_CONNECTIONS: '100',
      BENCHMARK_MESSAGES_PER_SECOND: '100',
    });

    expect(config.connections).toBe(100);
    expect(config.messagesPerSecond).toBe(100);
    expect(config.durationSeconds).toBe(30);
    expect(config.externalApi).toBe(false);
    expect(config.verifyDeliveries).toBe(false);
    expect(config.profilePid).toBeNull();
    expect(config.apiOrigins).toEqual(['http://127.0.0.1:3101']);
    expect(config.profilePids).toEqual([]);
    expect(config.roomIds).toEqual(['44444444-4444-4444-8444-444444444444']);
  });

  it('accepts unique room IDs for a fixed-rate fanout comparison', () => {
    expect(
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_ROOM_IDS: 'room-one, room-two',
      }).roomIds,
    ).toEqual(['room-one', 'room-two']);
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_ROOM_IDS: 'room-one, room-one',
      }),
    ).toThrow(/unique nonempty IDs/u);
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_ROOM_IDS: 'room-one, ',
      }),
    ).toThrow(/unique nonempty IDs/u);
  });

  it('accepts a separate API process with a profiler PID', () => {
    const config = readBenchmarkConfig({
      ...localEnvironment,
      BENCHMARK_EXTERNAL_API: '1',
      BENCHMARK_PROFILE_PID: '12345',
    });

    expect(config.externalApi).toBe(true);
    expect(config.profilePid).toBe(12345);
    expect(config.profilePids).toEqual([12345]);
  });

  it('accepts two isolated API processes with matching profiler PIDs', () => {
    const config = readBenchmarkConfig({
      ...localEnvironment,
      BENCHMARK_API_ORIGINS: 'http://127.0.0.1:3101,http://127.0.0.1:3102',
      BENCHMARK_EXTERNAL_API: '1',
      BENCHMARK_PROFILE_PIDS: '12345,23456',
    });
    expect(config.apiOrigins).toEqual([
      'http://127.0.0.1:3101',
      'http://127.0.0.1:3102',
    ]);
    expect(config.profilePids).toEqual([12345, 23456]);
  });

  it('rejects ambiguous or unsafe multi-process workloads', () => {
    const twoOrigins = {
      ...localEnvironment,
      BENCHMARK_API_ORIGINS: 'http://127.0.0.1:3101,http://127.0.0.1:3102',
      BENCHMARK_EXTERNAL_API: '1',
    };
    expect(() =>
      readBenchmarkConfig({
        ...twoOrigins,
        BENCHMARK_PROFILE_PIDS: '12345',
      }),
    ).toThrow(/PID count must match/u);
    expect(() =>
      readBenchmarkConfig({
        ...twoOrigins,
        BENCHMARK_API_ORIGINS:
          'http://127.0.0.1:3101,http://remote.example:3102',
      }),
    ).toThrow(/unique local HTTP origins/u);
    expect(() =>
      readBenchmarkConfig({
        ...twoOrigins,
        BENCHMARK_API_ORIGINS: 'http://127.0.0.1:3101,http://127.0.0.1:3101',
      }),
    ).toThrow(/unique local HTTP origins/u);
    expect(() =>
      readBenchmarkConfig({
        ...twoOrigins,
        BENCHMARK_EXTERNAL_API: '0',
      }),
    ).toThrow(/require BENCHMARK_EXTERNAL_API=1/u);
  });

  it('accepts an explicit delivery verification mode', () => {
    expect(
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_VERIFY_DELIVERIES: '1',
      }).verifyDeliveries,
    ).toBe(true);
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_VERIFY_DELIVERIES: 'yes',
      }),
    ).toThrow(/BENCHMARK_VERIFY_DELIVERIES must be 0 or 1/u);
  });

  it('rejects an invalid external API mode or profiler PID', () => {
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_EXTERNAL_API: 'yes',
      }),
    ).toThrow(/BENCHMARK_EXTERNAL_API must be 0 or 1/u);
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_EXTERNAL_API: '1',
        BENCHMARK_PROFILE_PID: '0',
      }),
    ).toThrow(/BENCHMARK_PROFILE_PID must be a positive integer/u);
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_PROFILE_PID: '12345',
      }),
    ).toThrow(/requires BENCHMARK_EXTERNAL_API=1/u);
  });

  it('rejects a non-benchmark database', () => {
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/livepulse',
      }),
    ).toThrow(/local livepulse_benchmark_/u);
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        DATABASE_URL:
          'postgresql://user:pass@db.example:5432/livepulse_benchmark_test',
      }),
    ).toThrow(/local livepulse_benchmark_/u);
  });

  it('rejects remote services and loads that trigger the per-peer rate limit', () => {
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        REDIS_URL: 'redis://remote.example:6379',
      }),
    ).toThrow(/Redis must be local/u);
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_API_ORIGIN: 'https://api.example:443',
      }),
    ).toThrow(/local HTTP origins/u);
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_CONNECTIONS: '20',
        BENCHMARK_MESSAGES_PER_SECOND: '50',
      }),
    ).toThrow(/at least one connection/u);
  });

  it('requires a positive measurement duration', () => {
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_DURATION_SECONDS: '0',
      }),
    ).toThrow(/BENCHMARK_DURATION_SECONDS must be a positive integer/u);
  });
});
