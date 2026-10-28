import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service.js';
import { RealtimeMetricsService } from './realtime-metrics.service.js';
import type { MuteCacheStore } from './redis-mute-store.js';
import { RoomMuteCache } from './room-mute-cache.js';

const roomId = 'room-1';
const userId = 'user-1';
const expiry = new Date('2026-10-28T12:05:00.000Z');

describe('RoomMuteCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('caches negative and positive database results for fifteen seconds', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        effectiveAt: new Date('2026-10-28T12:00:00.000Z'),
        expiresAt: expiry,
      });
    const store = new MemoryStore();
    const metrics = new RealtimeMetricsService();
    const cache = createCache(query, store, metrics);

    expect(await cache.findActiveMuteExpiry(roomId, userId)).toBeNull();
    expect(await cache.findActiveMuteExpiry(roomId, userId)).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_001);
    expect(await cache.findActiveMuteExpiry(roomId, userId)).toEqual(expiry);
    expect(await cache.findActiveMuteExpiry(roomId, userId)).toEqual(expiry);
    expect(query).toHaveBeenCalledTimes(2);
    expect(metrics.snapshot()).toMatchObject({
      muteCacheHits: 2,
      muteCacheMisses: 2,
    });
  });

  it('rejects a stale fill after invalidation and reloads the database', async () => {
    let resolveFirst!: (value: null) => void;
    const query = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<null>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue({
        effectiveAt: new Date('2026-10-28T12:00:00.000Z'),
        expiresAt: expiry,
      });
    const store = new MemoryStore();
    const cache = createCache(query, store);
    const pending = cache.findActiveMuteExpiry(roomId, userId);
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    await cache.invalidate(roomId, userId);
    resolveFirst(null);

    expect(await pending).toEqual(expiry);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('uses PostgreSQL when Redis fails and rejects a database failure', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValue(new Error('database unavailable'));
    const store = new MemoryStore();
    store.get = vi.fn().mockRejectedValue(new Error('redis unavailable'));
    const metrics = new RealtimeMetricsService();
    const cache = createCache(query, store, metrics);

    expect(await cache.findActiveMuteExpiry(roomId, userId)).toBeNull();
    await expect(cache.findActiveMuteExpiry(roomId, userId)).rejects.toThrow(
      'database unavailable',
    );
    expect(metrics.snapshot()).toMatchObject({
      muteDbFallbacks: 2,
      redisFailures: 2,
    });
  });

  it('returns after a committed mute when invalidation fails and retries', async () => {
    const store = new MemoryStore();
    const invalidate = vi
      .spyOn(store, 'invalidate')
      .mockRejectedValueOnce(new Error('redis unavailable'));
    const metrics = new RealtimeMetricsService();
    const cache = createCache(vi.fn().mockResolvedValue(null), store, metrics);

    await expect(cache.invalidate(roomId, userId)).resolves.toBeUndefined();
    expect(metrics.snapshot().muteInvalidationFailures).toBe(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

class MemoryStore implements MuteCacheStore {
  private value: { text: string; until: number } | undefined;
  private revision = 0;

  public async get(): Promise<string | null> {
    return this.value && this.value.until > Date.now() ? this.value.text : null;
  }

  public async version(): Promise<string> {
    return this.revision ? String(this.revision) : '';
  }

  public async fill(
    _roomId: string,
    _userId: string,
    version: string,
    value: string,
    ttlMs: number,
  ): Promise<0 | 1 | 2> {
    if (version !== (this.revision ? String(this.revision) : '')) return 0;
    if (await this.get()) return 2;
    this.value = { text: value, until: Date.now() + ttlMs };
    return 1;
  }

  public async invalidate(): Promise<void> {
    this.revision += 1;
    this.value = undefined;
  }
}

function createCache(
  query: ReturnType<typeof vi.fn>,
  store: MuteCacheStore,
  metrics = new RealtimeMetricsService(),
): RoomMuteCache {
  const database = {
    client: { roomMute: { findUnique: query } },
  } as unknown as DatabaseService;
  return new RoomMuteCache(database, metrics, store);
}
