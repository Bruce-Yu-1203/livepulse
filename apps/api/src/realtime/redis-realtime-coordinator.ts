import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DistributedRealtimeEventSchema,
  type DistributedRealtimeEvent,
} from '@livepulse/contracts';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

import type {
  RealtimeEventBus,
  RealtimePresence,
} from './realtime-coordination.js';

const presenceLeaseMilliseconds = 45_000;
const presenceKeyTtlSeconds = 60;

@Injectable()
export class RedisRealtimeCoordinator
  implements RealtimeEventBus, RealtimePresence, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisRealtimeCoordinator.name);
  private readonly commands: RedisClientType;
  private readonly subscriber: RedisClientType;
  private readonly listeners = new Set<
    (event: DistributedRealtimeEvent) => void
  >();
  private readonly channel: string;
  private readonly keyPrefix: string;
  private readonly useInMemory: boolean;
  private readonly inMemoryPresence = new Map<string, Set<string>>();

  public constructor() {
    const configuration = resolveRedisConfiguration({
      keyPrefix: process.env.REDIS_KEY_PREFIX,
      nodeEnvironment: process.env.NODE_ENV,
      redisUrl: process.env.REDIS_URL,
    });
    this.keyPrefix = configuration.keyPrefix;
    this.channel = `${this.keyPrefix}:room-events`;
    this.useInMemory =
      process.env.NODE_ENV === 'test' && process.env.REDIS_URL === undefined;
    this.commands = createClient({
      disableOfflineQueue: true,
      url: configuration.redisUrl,
    });
    this.subscriber = this.commands.duplicate();
    this.commands.on('error', (error) =>
      this.logger.error('Redis command connection error', error),
    );
    this.subscriber.on('error', (error) =>
      this.logger.error('Redis subscriber connection error', error),
    );
  }

  public async onModuleInit(): Promise<void> {
    if (this.useInMemory) {
      return;
    }

    await Promise.all([this.commands.connect(), this.subscriber.connect()]);
    await this.subscriber.subscribe(this.channel, (value) => {
      this.receive(value);
    });
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.useInMemory) {
      return;
    }

    await Promise.allSettled([
      this.commands.isOpen ? this.commands.close() : Promise.resolve(),
      this.subscriber.isOpen ? this.subscriber.close() : Promise.resolve(),
    ]);
  }

  public async publish(event: DistributedRealtimeEvent): Promise<void> {
    if (this.useInMemory) {
      for (const listener of this.listeners) {
        listener(event);
      }
      return;
    }

    if (!this.commands.isReady || !this.subscriber.isReady) {
      throw new Error('Redis realtime delivery is not ready');
    }

    const receivers = await this.commands.publish(
      this.channel,
      JSON.stringify(event),
    );
    if (receivers < 1) {
      throw new Error('Redis realtime delivery has no subscribers');
    }
  }

  public subscribe(
    listener: (event: DistributedRealtimeEvent) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async join(roomId: string, connectionId: string): Promise<number> {
    if (this.useInMemory) {
      const members = this.inMemoryPresence.get(roomId) ?? new Set<string>();
      members.add(connectionId);
      this.inMemoryPresence.set(roomId, members);
      return members.size;
    }

    const key = this.presenceKey(roomId);
    const now = Date.now();
    await this.commands.zAdd(key, {
      score: now + presenceLeaseMilliseconds,
      value: connectionId,
    });
    return this.cleanAndCount(key, now);
  }

  public async leave(roomId: string, connectionId: string): Promise<number> {
    if (this.useInMemory) {
      const members = this.inMemoryPresence.get(roomId) ?? new Set<string>();
      members.delete(connectionId);
      return members.size;
    }

    const key = this.presenceKey(roomId);
    await this.commands.zRem(key, connectionId);
    return this.cleanAndCount(key, Date.now());
  }

  public async refresh(
    connections: ReadonlyArray<{ connectionId: string; roomId: string }>,
  ): Promise<Map<string, number>> {
    if (this.useInMemory) {
      return new Map(
        [...new Set(connections.map(({ roomId }) => roomId))].map((roomId) => [
          roomId,
          this.inMemoryPresence.get(roomId)?.size ?? 0,
        ]),
      );
    }

    const byRoom = new Map<string, string[]>();
    for (const connection of connections) {
      const ids = byRoom.get(connection.roomId) ?? [];
      ids.push(connection.connectionId);
      byRoom.set(connection.roomId, ids);
    }

    const now = Date.now();
    const counts = new Map<string, number>();
    await Promise.all(
      [...byRoom].map(async ([roomId, connectionIds]) => {
        const key = this.presenceKey(roomId);
        await this.commands.zAdd(
          key,
          connectionIds.map((value) => ({
            score: now + presenceLeaseMilliseconds,
            value,
          })),
        );
        counts.set(roomId, await this.cleanAndCount(key, now));
      }),
    );
    return counts;
  }

  private async cleanAndCount(key: string, now: number): Promise<number> {
    await this.commands.zRemRangeByScore(key, 0, now);
    await this.commands.expire(key, presenceKeyTtlSeconds);
    return this.commands.zCard(key);
  }

  private presenceKey(roomId: string): string {
    return `${this.keyPrefix}:room:${roomId}:presence`;
  }

  private receive(value: string): void {
    try {
      const event = DistributedRealtimeEventSchema.parse(
        JSON.parse(value) as unknown,
      );
      for (const listener of this.listeners) {
        listener(event);
      }
    } catch {
      this.logger.warn('Ignored an invalid distributed realtime event');
    }
  }
}

interface RedisEnvironment {
  keyPrefix: string | undefined;
  nodeEnvironment: string | undefined;
  redisUrl: string | undefined;
}

export function resolveRedisConfiguration(environment: RedisEnvironment): {
  keyPrefix: string;
  redisUrl: string;
} {
  if (!environment.redisUrl && environment.nodeEnvironment === 'production') {
    throw new Error('REDIS_URL is required in production');
  }

  const keyPrefix = environment.keyPrefix?.trim() || 'livepulse';
  if (!/^[A-Za-z0-9:_-]{1,64}$/.test(keyPrefix)) {
    throw new Error('REDIS_KEY_PREFIX is invalid');
  }

  return {
    keyPrefix,
    redisUrl: environment.redisUrl ?? 'redis://localhost:6379',
  };
}
