import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { RealtimeMetricsService } from './realtime-metrics.service.js';

type RoomStatus = 'DRAFT' | 'LIVE' | 'ENDED' | undefined;

export interface RealtimeRoomSource {
  findActiveMuteExpiry(roomId: string, userId: string): Promise<Date | null>;
  isLive(roomId: string, fresh?: boolean): Promise<boolean>;
  markEnded?(roomId: string): void;
  releaseRoom?(roomId: string): void;
  clearRoomCache?(): void;
}

@Injectable()
export class DatabaseRealtimeRoomSource implements RealtimeRoomSource {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async isLive(roomId: string): Promise<boolean> {
    return (await this.status(roomId)) === 'LIVE';
  }

  public async status(roomId: string): Promise<RoomStatus> {
    const room = await this.database.client.room.findUnique({
      select: { status: true },
      where: { id: roomId },
    });

    return room?.status;
  }

  public async findActiveMuteExpiry(
    roomId: string,
    userId: string,
  ): Promise<Date | null> {
    const now = new Date();
    const mute = await this.database.client.roomMute.findUnique({
      select: { effectiveAt: true, expiresAt: true },
      where: { roomId_userId: { roomId, userId } },
    });

    if (!mute || mute.effectiveAt > now || mute.expiresAt <= now) {
      return null;
    }

    return mute.expiresAt;
  }
}

const liveTtlMs = 10_000;
const endedTtlMs = 10 * 60_000;
const maxRoomEntries = 10_000;

@Injectable()
export class CachedRealtimeRoomSource
  implements RealtimeRoomSource, OnModuleInit, OnModuleDestroy
{
  private readonly entries = new Map<
    string,
    { status: 'LIVE' | 'ENDED'; expiresAt: number }
  >();
  private readonly pending = new Map<string, Promise<boolean>>();
  private epoch = 0;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    @Inject(DatabaseRealtimeRoomSource)
    private readonly database: Pick<
      DatabaseRealtimeRoomSource,
      'status' | 'findActiveMuteExpiry'
    >,
    @Inject(RealtimeMetricsService)
    private readonly metrics: RealtimeMetricsService,
  ) {}

  public onModuleInit(): void {
    this.sweepTimer = setInterval(() => this.sweep(), liveTtlMs);
    this.sweepTimer.unref();
  }

  public onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
    this.clearRoomCache();
  }

  public async isLive(roomId: string, fresh = false): Promise<boolean> {
    const entry = this.entries.get(roomId);
    if (entry?.expiresAt !== undefined && entry.expiresAt > Date.now()) {
      if (entry.status === 'ENDED' || !fresh) {
        this.metrics.cacheEvent('roomCacheHits');
        return entry.status === 'LIVE';
      }
    }

    this.metrics.cacheEvent('roomCacheMisses');
    const existing = this.pending.get(roomId);
    if (existing) {
      return existing;
    }

    const load = this.load(roomId);
    this.pending.set(roomId, load);
    try {
      return await load;
    } finally {
      if (this.pending.get(roomId) === load) {
        this.pending.delete(roomId);
      }
    }
  }

  public findActiveMuteExpiry(
    roomId: string,
    userId: string,
  ): Promise<Date | null> {
    return this.database.findActiveMuteExpiry(roomId, userId);
  }

  public markEnded(roomId: string): void {
    this.set(roomId, 'ENDED', endedTtlMs);
  }

  public releaseRoom(roomId: string): void {
    if (this.entries.get(roomId)?.status === 'LIVE') {
      this.entries.delete(roomId);
    }
  }

  public clearRoomCache(): void {
    this.epoch += 1;
    this.entries.clear();
  }

  private async load(roomId: string): Promise<boolean> {
    let epoch: number;
    let status: RoomStatus;
    do {
      epoch = this.epoch;
      status = await this.database.status(roomId);
    } while (epoch !== this.epoch);
    if (this.entries.get(roomId)?.status === 'ENDED') {
      return false;
    }
    if (status === 'LIVE') {
      this.set(roomId, 'LIVE', liveTtlMs);
      return true;
    }
    if (status === 'ENDED') {
      this.set(roomId, 'ENDED', endedTtlMs);
    } else {
      this.entries.delete(roomId);
    }
    return false;
  }

  private set(roomId: string, status: 'LIVE' | 'ENDED', ttlMs: number): void {
    this.entries.delete(roomId);
    this.entries.set(roomId, { status, expiresAt: Date.now() + ttlMs });
    if (this.entries.size > maxRoomEntries) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [roomId, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(roomId);
      }
    }
  }
}
