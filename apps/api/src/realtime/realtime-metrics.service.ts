import { Injectable } from '@nestjs/common';

const oneMinuteMilliseconds = 60_000;

export interface RealtimeMetricsSnapshot {
  acceptedMessages: number;
  acceptedMessagesLastMinute: number;
  activeConnections: number;
  deliveryAttempts: number;
  redisFailures: number;
  sessionCacheHits: number;
  sessionRefreshes: number;
  roomCacheHits: number;
  roomCacheMisses: number;
  muteCacheHits: number;
  muteCacheMisses: number;
  muteDbFallbacks: number;
  muteInvalidationFailures: number;
  startedAt: string;
}

@Injectable()
export class RealtimeMetricsService {
  private readonly acceptedMessageTimes: number[] = [];
  private readonly startedAt = Date.now();
  private acceptedMessages = 0;
  private activeConnections = 0;
  private deliveryAttempts = 0;
  private redisFailures = 0;
  private readonly cacheCounters = {
    sessionCacheHits: 0,
    sessionRefreshes: 0,
    roomCacheHits: 0,
    roomCacheMisses: 0,
    muteCacheHits: 0,
    muteCacheMisses: 0,
    muteDbFallbacks: 0,
    muteInvalidationFailures: 0,
  };

  public cacheEvent(name: keyof typeof this.cacheCounters): void {
    this.cacheCounters[name] += 1;
  }

  public connectionOpened(): void {
    this.activeConnections += 1;
  }

  public connectionClosed(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  public messageAccepted(now = Date.now()): void {
    this.acceptedMessages += 1;
    this.acceptedMessageTimes.push(now);
    this.pruneAcceptedMessages(now);
  }

  public deliveriesAttempted(count: number): void {
    this.deliveryAttempts += count;
  }

  public redisFailed(): void {
    this.redisFailures += 1;
  }

  public snapshot(now = Date.now()): RealtimeMetricsSnapshot {
    this.pruneAcceptedMessages(now);
    return {
      acceptedMessages: this.acceptedMessages,
      acceptedMessagesLastMinute: this.acceptedMessageTimes.length,
      activeConnections: this.activeConnections,
      deliveryAttempts: this.deliveryAttempts,
      redisFailures: this.redisFailures,
      ...this.cacheCounters,
      startedAt: new Date(this.startedAt).toISOString(),
    };
  }

  private pruneAcceptedMessages(now: number): void {
    const cutoff = now - oneMinuteMilliseconds;
    while ((this.acceptedMessageTimes[0] ?? now) <= cutoff) {
      this.acceptedMessageTimes.shift();
    }
  }
}
