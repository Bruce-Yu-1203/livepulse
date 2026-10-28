import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

import { resolveRedisConfiguration } from '../rate-limit/redis-configuration.js';

const fillScript = `
local version = redis.call('GET', KEYS[2])
if not version then version = '' end
if version ~= ARGV[1] then return 0 end
if redis.call('EXISTS', KEYS[1]) == 1 then return 2 end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
return 1
`;

const invalidateScript = `
redis.call('INCR', KEYS[2])
redis.call('PEXPIRE', KEYS[2], 60000)
redis.call('DEL', KEYS[1])
return 1
`;

export interface MuteCacheStore {
  get(roomId: string, userId: string): Promise<string | null>;
  version(roomId: string, userId: string): Promise<string>;
  fill(
    roomId: string,
    userId: string,
    version: string,
    value: string,
    ttlMs: number,
  ): Promise<0 | 1 | 2>;
  invalidate(roomId: string, userId: string): Promise<void>;
}

@Injectable()
export class RedisMuteStore
  implements MuteCacheStore, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisMuteStore.name);
  private readonly client: RedisClientType;
  private readonly prefix: string;
  private readonly useInMemory: boolean;
  private readonly memory = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  public constructor() {
    const config = resolveRedisConfiguration({
      keyPrefix: process.env.REDIS_KEY_PREFIX,
      nodeEnvironment: process.env.NODE_ENV,
      redisUrl: process.env.REDIS_URL,
    });
    this.prefix = config.keyPrefix;
    this.useInMemory =
      process.env.NODE_ENV === 'test' && process.env.REDIS_URL === undefined;
    this.client = createClient({
      disableOfflineQueue: true,
      url: config.redisUrl,
    });
    this.client.on('error', (error) =>
      this.logger.error('Redis mute cache connection error', error),
    );
  }

  public async onModuleInit(): Promise<void> {
    if (!this.useInMemory) {
      await this.client.connect();
    }
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.close();
    }
    this.memory.clear();
  }

  public async get(roomId: string, userId: string): Promise<string | null> {
    const key = this.valueKey(roomId, userId);
    if (this.useInMemory) {
      return this.memoryGet(key);
    }
    return this.client.get(key);
  }

  public async version(roomId: string, userId: string): Promise<string> {
    const key = this.versionKey(roomId, userId);
    if (this.useInMemory) {
      return this.memoryGet(key) ?? '';
    }
    return (await this.client.get(key)) ?? '';
  }

  public async fill(
    roomId: string,
    userId: string,
    version: string,
    value: string,
    ttlMs: number,
  ): Promise<0 | 1 | 2> {
    const key = this.valueKey(roomId, userId);
    const versionKey = this.versionKey(roomId, userId);
    if (this.useInMemory) {
      if ((this.memoryGet(versionKey) ?? '') !== version) return 0;
      if (this.memoryGet(key) !== null) return 2;
      this.memory.set(key, { value, expiresAt: Date.now() + ttlMs });
      return 1;
    }
    const result = await this.client.eval(fillScript, {
      keys: [key, versionKey],
      arguments: [version, value, String(ttlMs)],
    });
    if (result !== 0 && result !== 1 && result !== 2) {
      throw new Error('Invalid Redis mute fill result');
    }
    return result;
  }

  public async invalidate(roomId: string, userId: string): Promise<void> {
    const key = this.valueKey(roomId, userId);
    const versionKey = this.versionKey(roomId, userId);
    if (this.useInMemory) {
      const next = Number(this.memoryGet(versionKey) ?? '0') + 1;
      this.memory.set(versionKey, {
        value: String(next),
        expiresAt: Date.now() + 60_000,
      });
      this.memory.delete(key);
      return;
    }
    await this.client.eval(invalidateScript, {
      keys: [key, versionKey],
      arguments: [],
    });
  }

  private valueKey(roomId: string, userId: string): string {
    return `${this.prefix}:chat:mute:v1:${roomId}:${userId}`;
  }

  private versionKey(roomId: string, userId: string): string {
    return `${this.prefix}:chat:mute-version:v1:${roomId}:${userId}`;
  }

  private memoryGet(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }
}
