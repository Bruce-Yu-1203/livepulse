import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  countPresence,
  RedisRealtimeCoordinator,
  resolveRedisConfiguration,
} from './redis-realtime-coordinator.js';

describe('Redis realtime configuration', () => {
  it('uses explicit configuration and development defaults', () => {
    expect(
      resolveRedisConfiguration({
        keyPrefix: 'livepulse:test',
        nodeEnvironment: 'production',
        redisUrl: 'rediss://redis.example:6380',
      }),
    ).toEqual({
      keyPrefix: 'livepulse:test',
      redisUrl: 'rediss://redis.example:6380',
    });
    expect(
      resolveRedisConfiguration({
        keyPrefix: undefined,
        nodeEnvironment: 'development',
        redisUrl: undefined,
      }),
    ).toEqual({
      keyPrefix: 'livepulse',
      redisUrl: 'redis://localhost:6379',
    });
  });

  it('rejects missing production URLs and unsafe key prefixes', () => {
    expect(() =>
      resolveRedisConfiguration({
        keyPrefix: undefined,
        nodeEnvironment: 'production',
        redisUrl: undefined,
      }),
    ).toThrow('REDIS_URL is required in production');
    expect(() =>
      resolveRedisConfiguration({
        keyPrefix: 'contains spaces',
        nodeEnvironment: 'development',
        redisUrl: undefined,
      }),
    ).toThrow('REDIS_KEY_PREFIX is invalid');
  });
});

describe('message rate limiting without a Redis URL', () => {
  beforeEach(() => {
    vi.stubEnv('REDIS_URL', undefined);
    vi.stubEnv('NODE_ENV', 'test');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T20:00:00.000Z'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('allows five messages, then refills one token per second', async () => {
    const coordinator = new RedisRealtimeCoordinator();
    for (let index = 0; index < 5; index += 1) {
      await expect(
        coordinator.consumeMessageToken('room-1', 'user-1'),
      ).resolves.toBeUndefined();
    }
    await expect(
      coordinator.consumeMessageToken('room-1', 'user-1'),
    ).resolves.toBe(1_000);
    vi.advanceTimersByTime(500);
    await expect(
      coordinator.consumeMessageToken('room-1', 'user-1'),
    ).resolves.toBe(500);
    vi.advanceTimersByTime(500);
    await expect(
      coordinator.consumeMessageToken('room-1', 'user-1'),
    ).resolves.toBeUndefined();
  });

  it('keeps separate buckets for each room and user', async () => {
    const coordinator = new RedisRealtimeCoordinator();
    for (let index = 0; index < 5; index += 1) {
      await coordinator.consumeMessageToken('room-1', 'user-1');
    }
    await expect(
      coordinator.consumeMessageToken('room-1', 'user-2'),
    ).resolves.toBeUndefined();
    await expect(
      coordinator.consumeMessageToken('room-2', 'user-1'),
    ).resolves.toBeUndefined();
  });

  it('delivers session control notices on a separate local subscription', async () => {
    const coordinator = new RedisRealtimeCoordinator();
    const notice = vi.fn();
    const roomEvent = vi.fn();
    coordinator.subscribeControl(notice);
    coordinator.subscribe(roomEvent);

    await coordinator.publishControl({
      type: 'session.revoked',
      sessionId: 'session-1',
    });

    expect(notice).toHaveBeenCalledWith({
      type: 'session.revoked',
      sessionId: 'session-1',
    });
    expect(roomEvent).not.toHaveBeenCalled();
  });
});

describe('presence counting', () => {
  it('counts browser connections separately from authenticated users', () => {
    expect(
      countPresence(
        new Map([
          ['connection-1', 'user:viewer-1'],
          ['connection-2', 'user:viewer-1'],
          ['connection-3', 'connection:guest-1'],
        ]),
      ),
    ).toEqual({ connections: 3, uniqueUsers: 2 });
  });
});
