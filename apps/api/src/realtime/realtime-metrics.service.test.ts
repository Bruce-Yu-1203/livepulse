import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RealtimeMetricsService } from './realtime-metrics.service.js';

describe('RealtimeMetricsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T20:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks active connections without allowing a negative count', () => {
    const metrics = new RealtimeMetricsService();
    metrics.connectionOpened();
    metrics.connectionOpened();
    metrics.connectionClosed();
    metrics.connectionClosed();
    metrics.connectionClosed();

    expect(metrics.snapshot().activeConnections).toBe(0);
  });

  it('keeps cumulative messages and a rolling one-minute rate', () => {
    const metrics = new RealtimeMetricsService();
    metrics.messageAccepted();
    vi.advanceTimersByTime(30_000);
    metrics.messageAccepted();
    metrics.deliveriesAttempted(12);
    metrics.redisFailed();

    expect(metrics.snapshot()).toMatchObject({
      acceptedMessages: 2,
      acceptedMessagesLastMinute: 2,
      deliveryAttempts: 12,
      redisFailures: 1,
    });
    vi.advanceTimersByTime(30_001);
    expect(metrics.snapshot()).toMatchObject({
      acceptedMessages: 2,
      acceptedMessagesLastMinute: 1,
    });
  });

  it('counts cache activity by layer', () => {
    const metrics = new RealtimeMetricsService();
    metrics.cacheEvent('sessionCacheHits');
    metrics.cacheEvent('sessionRefreshes');
    metrics.cacheEvent('roomCacheMisses');
    metrics.cacheEvent('muteInvalidationFailures');

    expect(metrics.snapshot()).toMatchObject({
      sessionCacheHits: 1,
      sessionRefreshes: 1,
      roomCacheHits: 0,
      roomCacheMisses: 1,
      muteInvalidationFailures: 1,
    });
  });
});
