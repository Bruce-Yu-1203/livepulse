import { Inject, Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { RealtimeMetricsService } from './realtime-metrics.service.js';
import { RedisMuteStore, type MuteCacheStore } from './redis-mute-store.js';

type MuteSnapshot = { effectiveAt: Date; expiresAt: Date } | null;
const ttlMs = 15_000;
const databaseTimeoutMs = 5_000;
const retryDelaysMs = [250, 1_000, 3_000];

@Injectable()
export class RoomMuteCache {
  private readonly logger = new Logger(RoomMuteCache.name);
  private readonly pending = new Map<string, Promise<Date | null>>();

  public constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(RealtimeMetricsService)
    private readonly metrics: RealtimeMetricsService,
    @Inject(RedisMuteStore)
    private readonly store: MuteCacheStore,
  ) {}

  public async findActiveMuteExpiry(
    roomId: string,
    userId: string,
  ): Promise<Date | null> {
    let value: string | null;
    try {
      value = await this.store.get(roomId, userId);
    } catch {
      this.metrics.redisFailed();
      this.metrics.cacheEvent('muteDbFallbacks');
      return activeExpiry(await this.query(roomId, userId));
    }

    if (value !== null) {
      const parsed = decode(value);
      if (parsed.valid) {
        this.metrics.cacheEvent('muteCacheHits');
        return activeExpiry(parsed.snapshot);
      }
      this.metrics.cacheEvent('muteDbFallbacks');
      return activeExpiry(await this.query(roomId, userId));
    }

    this.metrics.cacheEvent('muteCacheMisses');
    const key = `${roomId}:${userId}`;
    const existing = this.pending.get(key);
    if (existing) return existing;

    const load = this.load(roomId, userId);
    this.pending.set(key, load);
    try {
      return await load;
    } finally {
      if (this.pending.get(key) === load) this.pending.delete(key);
    }
  }

  public async invalidate(roomId: string, userId: string): Promise<void> {
    try {
      await this.store.invalidate(roomId, userId);
    } catch (error) {
      this.recordInvalidationFailure(error);
      this.retryInvalidation(roomId, userId, 0);
    }
  }

  private async load(roomId: string, userId: string): Promise<Date | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let version: string;
      try {
        version = await this.store.version(roomId, userId);
      } catch {
        this.metrics.redisFailed();
        this.metrics.cacheEvent('muteDbFallbacks');
        return activeExpiry(await this.query(roomId, userId));
      }

      const snapshot = await this.query(roomId, userId);
      try {
        const outcome = await this.store.fill(
          roomId,
          userId,
          version,
          encode(snapshot),
          cacheTtl(snapshot),
        );
        if (outcome === 1) return activeExpiry(snapshot);
        if (outcome === 2) {
          const value = await this.store.get(roomId, userId);
          if (value !== null) {
            const parsed = decode(value);
            if (parsed.valid) return activeExpiry(parsed.snapshot);
          }
        }
      } catch {
        this.metrics.redisFailed();
        this.metrics.cacheEvent('muteDbFallbacks');
        return activeExpiry(await this.query(roomId, userId));
      }
    }

    this.metrics.cacheEvent('muteDbFallbacks');
    return activeExpiry(await this.query(roomId, userId));
  }

  private async query(roomId: string, userId: string): Promise<MuteSnapshot> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.database.client.roomMute.findUnique({
          select: { effectiveAt: true, expiresAt: true },
          where: { roomId_userId: { roomId, userId } },
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Mute database lookup timed out')),
            databaseTimeoutMs,
          );
          timer.unref();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private retryInvalidation(
    roomId: string,
    userId: string,
    attempt: number,
  ): void {
    const delay = retryDelaysMs[attempt];
    if (delay === undefined) return;
    const timer = setTimeout(() => {
      void this.store.invalidate(roomId, userId).catch((error: unknown) => {
        this.recordInvalidationFailure(error);
        this.retryInvalidation(roomId, userId, attempt + 1);
      });
    }, delay);
    timer.unref();
  }

  private recordInvalidationFailure(error: unknown): void {
    this.metrics.redisFailed();
    this.metrics.cacheEvent('muteInvalidationFailures');
    this.logger.error('Could not invalidate mute cache', error);
  }
}

function activeExpiry(snapshot: MuteSnapshot): Date | null {
  const now = Date.now();
  return snapshot &&
    snapshot.effectiveAt.getTime() <= now &&
    snapshot.expiresAt.getTime() > now
    ? snapshot.expiresAt
    : null;
}

function cacheTtl(snapshot: MuteSnapshot): number {
  return snapshot && snapshot.expiresAt.getTime() > Date.now()
    ? Math.max(1, Math.min(ttlMs, snapshot.expiresAt.getTime() - Date.now()))
    : ttlMs;
}

function encode(snapshot: MuteSnapshot): string {
  return snapshot
    ? JSON.stringify([
        snapshot.effectiveAt.toISOString(),
        snapshot.expiresAt.toISOString(),
      ])
    : 'none';
}

function decode(
  value: string,
): { valid: true; snapshot: MuteSnapshot } | { valid: false } {
  if (value === 'none') return { valid: true, snapshot: null };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 2) return { valid: false };
    const [effectiveAt, expiresAt] = parsed;
    if (typeof effectiveAt !== 'string' || typeof expiresAt !== 'string') {
      return { valid: false };
    }
    const effective = new Date(effectiveAt);
    const expiry = new Date(expiresAt);
    if (
      !Number.isFinite(effective.getTime()) ||
      !Number.isFinite(expiry.getTime()) ||
      effective >= expiry
    ) {
      return { valid: false };
    }
    return {
      valid: true,
      snapshot: { effectiveAt: effective, expiresAt: expiry },
    };
  } catch {
    return { valid: false };
  }
}
