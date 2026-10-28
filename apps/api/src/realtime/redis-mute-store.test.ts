import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RedisMuteStore } from './redis-mute-store.js';

describe('RedisMuteStore version markers', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('REDIS_URL', undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('does not reuse a version when a write crosses the marker expiration', async () => {
    const store = new RedisMuteStore();
    await store.invalidate('room', 'user');
    vi.advanceTimersByTime(59_999);
    const observed = await store.version('room', 'user');
    vi.advanceTimersByTime(2);
    await store.invalidate('room', 'user');

    expect(await store.version('room', 'user')).not.toBe(observed);
    expect(await store.fill('room', 'user', observed, 'none', 15_000)).toBe(0);
    await store.onModuleDestroy();
  });
});
