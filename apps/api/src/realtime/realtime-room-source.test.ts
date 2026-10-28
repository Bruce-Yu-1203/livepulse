import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RealtimeMetricsService } from './realtime-metrics.service.js';
import {
  CachedRealtimeRoomSource,
  type DatabaseRealtimeRoomSource,
} from './realtime-room-source.js';

describe('CachedRealtimeRoomSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('caches live sends for ten seconds but checks fresh joins', async () => {
    const status = vi.fn().mockResolvedValue('LIVE');
    const metrics = new RealtimeMetricsService();
    const cache = source(status, metrics);

    expect(await cache.isLive('room')).toBe(true);
    expect(await cache.isLive('room')).toBe(true);
    expect(status).toHaveBeenCalledTimes(1);
    expect(await cache.isLive('room', true)).toBe(true);
    expect(status).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(10_001);
    status.mockResolvedValue('ENDED');
    expect(await cache.isLive('room')).toBe(false);
    expect(metrics.snapshot()).toMatchObject({
      roomCacheHits: 1,
      roomCacheMisses: 3,
    });
  });

  it('keeps an ended event ahead of an older in-flight read', async () => {
    let resolveStatus!: (status: 'LIVE') => void;
    const status = vi.fn().mockImplementation(
      () =>
        new Promise<'LIVE'>((resolve) => {
          resolveStatus = resolve;
        }),
    );
    const cache = source(status);
    const pending = cache.isLive('room');
    cache.markEnded('room');
    resolveStatus('LIVE');

    expect(await pending).toBe(false);
    expect(await cache.isLive('room')).toBe(false);
    expect(status).toHaveBeenCalledTimes(1);
  });

  it('does not cache draft or use expired live state when database fails', async () => {
    const status = vi
      .fn()
      .mockResolvedValueOnce('DRAFT')
      .mockResolvedValueOnce('LIVE');
    const cache = source(status);
    expect(await cache.isLive('room')).toBe(false);
    expect(await cache.isLive('room')).toBe(true);
    vi.advanceTimersByTime(10_001);
    status.mockRejectedValue(new Error('database unavailable'));
    await expect(cache.isLive('room')).rejects.toThrow('database unavailable');
  });

  it('sweeps entries without connected sockets and refetches after clear', async () => {
    const status = vi.fn().mockResolvedValue('LIVE');
    const cache = source(status);
    cache.onModuleInit();
    await cache.isLive('room');
    vi.advanceTimersByTime(10_000);
    status.mockResolvedValue('ENDED');
    expect(await cache.isLive('room')).toBe(false);
    cache.clearRoomCache();
    expect(await cache.isLive('room')).toBe(false);
    expect(status).toHaveBeenCalledTimes(3);
    cache.onModuleDestroy();
  });

  it('does not use a read started before a subscription reconnect', async () => {
    let resolveFirst!: (status: 'LIVE') => void;
    const status = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<'LIVE'>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue('ENDED');
    const cache = source(status);
    const pending = cache.isLive('room');
    cache.clearRoomCache();
    resolveFirst('LIVE');

    expect(await pending).toBe(false);
    expect(status).toHaveBeenCalledTimes(2);
  });
});

function source(
  status: ReturnType<typeof vi.fn>,
  metrics = new RealtimeMetricsService(),
): CachedRealtimeRoomSource {
  return new CachedRealtimeRoomSource(
    {
      status,
      findActiveMuteExpiry: vi.fn().mockResolvedValue(null),
    } as Pick<DatabaseRealtimeRoomSource, 'status' | 'findActiveMuteExpiry'>,
    metrics,
    { findActiveMuteExpiry: vi.fn().mockResolvedValue(null) },
  );
}
