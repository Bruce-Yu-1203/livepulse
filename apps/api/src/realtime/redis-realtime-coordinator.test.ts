import { describe, expect, it } from 'vitest';

import { resolveRedisConfiguration } from './redis-realtime-coordinator.js';

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
