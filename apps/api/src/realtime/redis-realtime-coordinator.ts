import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DistributedRealtimeEventSchema,
  type DistributedRealtimeEvent,
} from '@livepulse/contracts';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

import {
  consumeInMemoryToken,
  consumeTokenScript,
} from '../rate-limit/token-bucket.js';
import { resolveRedisConfiguration } from '../rate-limit/redis-configuration.js';

import type {
  PresenceConnection,
  PresenceCounts,
  RealtimeEventBus,
  RealtimePresence,
  RealtimeRateLimiter,
  RealtimeControl,
  RealtimeControlEvent,
} from './realtime-coordination.js';

const presenceLeaseMilliseconds = 45_000;
const presenceKeyTtlSeconds = 60;
const messageBucketCapacity = 5;
const messageRefillMilliseconds = 1_000;
const messageBucketTtlMilliseconds = 10_000;
@Injectable()
export class RedisRealtimeCoordinator
  implements
    RealtimeEventBus,
    RealtimePresence,
    RealtimeRateLimiter,
    RealtimeControl,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(RedisRealtimeCoordinator.name);
  private readonly commands: RedisClientType;
  private readonly subscriber: RedisClientType;
  private readonly listeners = new Set<
    (event: DistributedRealtimeEvent) => void
  >();
  private readonly controlListeners = new Set<
    (event: RealtimeControlEvent) => void
  >();
  private readonly reconnectListeners = new Set<() => void>();
  private readonly channel: string;
  private readonly controlChannel: string;
  private subscriptionsReady = false;
  private readonly keyPrefix: string;
  private readonly useInMemory: boolean;
  private readonly inMemoryPresence = new Map<string, Map<string, string>>();
  private readonly inMemoryMessageBuckets = new Map<
    string,
    { tokens: number; updatedAt: number }
  >();

  public constructor() {
    const configuration = resolveRedisConfiguration({
      keyPrefix: process.env.REDIS_KEY_PREFIX,
      nodeEnvironment: process.env.NODE_ENV,
      redisUrl: process.env.REDIS_URL,
    });
    this.keyPrefix = configuration.keyPrefix;
    this.channel = `${this.keyPrefix}:room-events`;
    this.controlChannel = `${this.keyPrefix}:realtime-control`;
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
    this.subscriber.on('ready', () => {
      if (this.subscriptionsReady) {
        for (const listener of this.reconnectListeners) listener();
      }
    });
  }

  public async onModuleInit(): Promise<void> {
    if (this.useInMemory) {
      return;
    }

    await Promise.all([this.commands.connect(), this.subscriber.connect()]);
    await this.subscriber.subscribe(this.channel, (value) => {
      this.receive(value);
    });
    await this.subscriber.subscribe(this.controlChannel, (value) => {
      this.receiveControl(value);
    });
    this.subscriptionsReady = true;
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

    if (event.type === 'message.deleted') {
      await this.commands.set(
        `${this.keyPrefix}:message-deleted:${event.payload.messageId}`,
        event.payload.deletedAt,
        { EX: 7 * 24 * 60 * 60 },
      );
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

  public async publishControl(event: RealtimeControlEvent): Promise<void> {
    for (const listener of this.controlListeners) listener(event);
    if (this.useInMemory) return;
    if (!this.commands.isReady || !this.subscriber.isReady) {
      throw new Error('Redis realtime control is not ready');
    }
    const receivers = await this.commands.publish(
      this.controlChannel,
      JSON.stringify(event),
    );
    if (receivers < 1) {
      throw new Error('Redis realtime control has no subscribers');
    }
  }

  public subscribeControl(
    listener: (event: RealtimeControlEvent) => void,
  ): () => void {
    this.controlListeners.add(listener);
    return () => this.controlListeners.delete(listener);
  }

  public subscribeReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }

  private receiveControl(value: string): void {
    try {
      const candidate: unknown = JSON.parse(value);
      if (!isControlEvent(candidate)) return;
      for (const listener of this.controlListeners) listener(candidate);
    } catch {
      this.logger.warn('Ignored malformed realtime control event');
    }
  }

  public async consumeMessageToken(
    roomId: string,
    userId: string,
  ): Promise<number | undefined> {
    const key = `${this.keyPrefix}:rate-limit:chat:room:${roomId}:user:${userId}`;
    if (this.useInMemory) {
      return consumeInMemoryToken(this.inMemoryMessageBuckets, key, {
        capacity: messageBucketCapacity,
        refillMilliseconds: messageRefillMilliseconds,
        ttlMilliseconds: messageBucketTtlMilliseconds,
      });
    }

    const result = await this.commands.eval(consumeTokenScript, {
      arguments: [
        String(messageBucketCapacity),
        String(messageRefillMilliseconds),
        String(messageBucketTtlMilliseconds),
      ],
      keys: [key],
    });
    if (typeof result !== 'number' || !Number.isSafeInteger(result)) {
      throw new Error('Redis returned an invalid rate limit result');
    }
    return result === 0 ? undefined : result;
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

function isControlEvent(value: unknown): value is RealtimeControlEvent {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }
  if (value.type === 'session.revoked') {
    return 'sessionId' in value && typeof value.sessionId === 'string';
  }
  return (
    value.type === 'user.sessions.revoked' &&
    'userId' in value &&
    typeof value.userId === 'string' &&
    (!('exceptSessionId' in value) || typeof value.exceptSessionId === 'string')
  );
}

export { resolveRedisConfiguration } from '../rate-limit/redis-configuration.js';
