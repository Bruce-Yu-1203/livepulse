import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DistributedRealtimeEventSchema,
  type DistributedRealtimeEvent,
} from '@livepulse/contracts';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

import type {
  PresenceConnection,
  PresenceCounts,
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
  private readonly inMemoryPresence = new Map<string, Map<string, string>>();

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

  public async join(
    roomId: string,
    connectionId: string,
    identityId: string,
  ): Promise<PresenceCounts> {
    if (this.useInMemory) {
      const members =
        this.inMemoryPresence.get(roomId) ?? new Map<string, string>();
      members.set(connectionId, identityId);
      this.inMemoryPresence.set(roomId, members);
      return countPresence(members);
    }

    const key = this.presenceKey(roomId);
    const identitiesKey = this.presenceIdentitiesKey(roomId);
    const now = Date.now();
    await Promise.all([
      this.commands.zAdd(key, {
        score: now + presenceLeaseMilliseconds,
        value: connectionId,
      }),
      this.commands.hSet(identitiesKey, connectionId, identityId),
    ]);
    return this.cleanAndCount(key, identitiesKey, now);
  }

  public async leave(
    roomId: string,
    connectionId: string,
  ): Promise<PresenceCounts> {
    if (this.useInMemory) {
      const members =
        this.inMemoryPresence.get(roomId) ?? new Map<string, string>();
      members.delete(connectionId);
      return countPresence(members);
    }

    const key = this.presenceKey(roomId);
    const identitiesKey = this.presenceIdentitiesKey(roomId);
    await Promise.all([
      this.commands.zRem(key, connectionId),
      this.commands.hDel(identitiesKey, connectionId),
    ]);
    return this.cleanAndCount(key, identitiesKey, Date.now());
  }

  public async refresh(
    connections: readonly PresenceConnection[],
  ): Promise<Map<string, PresenceCounts>> {
    if (this.useInMemory) {
      return new Map(
        [...new Set(connections.map(({ roomId }) => roomId))].map((roomId) => [
          roomId,
          countPresence(
            this.inMemoryPresence.get(roomId) ?? new Map<string, string>(),
          ),
        ]),
      );
    }

    const byRoom = new Map<string, PresenceConnection[]>();
    for (const connection of connections) {
      const roomConnections = byRoom.get(connection.roomId) ?? [];
      roomConnections.push(connection);
      byRoom.set(connection.roomId, roomConnections);
    }

    const now = Date.now();
    const counts = new Map<string, PresenceCounts>();
    await Promise.all(
      [...byRoom].map(async ([roomId, roomConnections]) => {
        const key = this.presenceKey(roomId);
        const identitiesKey = this.presenceIdentitiesKey(roomId);
        await Promise.all([
          this.commands.zAdd(
            key,
            roomConnections.map(({ connectionId }) => ({
              score: now + presenceLeaseMilliseconds,
              value: connectionId,
            })),
          ),
          this.commands.hSet(
            identitiesKey,
            Object.fromEntries(
              roomConnections.map(({ connectionId, identityId }) => [
                connectionId,
                identityId,
              ]),
            ),
          ),
        ]);
        counts.set(roomId, await this.cleanAndCount(key, identitiesKey, now));
      }),
    );
    return counts;
  }

  private async cleanAndCount(
    key: string,
    identitiesKey: string,
    now: number,
  ): Promise<PresenceCounts> {
    const expiredConnectionIds = await this.commands.zRangeByScore(key, 0, now);
    await this.commands.zRemRangeByScore(key, 0, now);
    if (expiredConnectionIds.length > 0) {
      await this.commands.hDel(identitiesKey, expiredConnectionIds);
    }
    await Promise.all([
      this.commands.expire(key, presenceKeyTtlSeconds),
      this.commands.expire(identitiesKey, presenceKeyTtlSeconds),
    ]);
    const activeConnectionIds = await this.commands.zRange(key, 0, -1);
    const identities =
      activeConnectionIds.length === 0
        ? []
        : await this.commands.hmGet(identitiesKey, activeConnectionIds);
    return {
      connections: activeConnectionIds.length,
      uniqueUsers: new Set(
        activeConnectionIds.map(
          (connectionId, index) =>
            identities[index] ?? `connection:${connectionId}`,
        ),
      ).size,
    };
  }

  private presenceKey(roomId: string): string {
    return `${this.keyPrefix}:room:${roomId}:presence`;
  }

  private presenceIdentitiesKey(roomId: string): string {
    return `${this.keyPrefix}:room:${roomId}:presence-identities`;
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

export function countPresence(
  connections: ReadonlyMap<string, string>,
): PresenceCounts {
  return {
    connections: connections.size,
    uniqueUsers: new Set(connections.values()).size,
  };
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
