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
    expect(config.nativeRoomBroadcast).toBe(false);
    expect(config.profilePid).toBeNull();
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
  });

  it('accepts an explicit native room broadcast benchmark mode', () => {
    expect(
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_NATIVE_ROOM_BROADCAST: '1',
      }).nativeRoomBroadcast,
    ).toBe(true);
    expect(() =>
      readBenchmarkConfig({
        ...localEnvironment,
        BENCHMARK_NATIVE_ROOM_BROADCAST: 'yes',
      }),
    ).toThrow(/BENCHMARK_NATIVE_ROOM_BROADCAST must be 0 or 1/u);
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
    ).toThrow(/local HTTP origin/u);
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
