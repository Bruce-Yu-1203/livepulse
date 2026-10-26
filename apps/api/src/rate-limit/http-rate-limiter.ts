import { createHash, createHmac, randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

import { resolveRedisConfiguration } from './redis-configuration.js';
import {
  consumeInMemoryToken,
  consumeTokenScript,
  type TokenBucketPolicy,
} from './token-bucket.js';

export const httpRateLimitPolicies = {
  registrationStart: {
    capacity: 60,
    refillMilliseconds: 30_000,
    ttlMilliseconds: 1_200_000,
  },
  registrationComplete: {
    capacity: 60,
    refillMilliseconds: 10_000,
    ttlMilliseconds: 600_000,
  },
  signIn: {
    capacity: 80,
    refillMilliseconds: 15_000,
    ttlMilliseconds: 600_000,
  },
  avatarUpload: {
    capacity: 30,
    refillMilliseconds: 10_000,
    ttlMilliseconds: 720_000,
  },
  reportCreate: {
    capacity: 50,
    refillMilliseconds: 10_000,
    ttlMilliseconds: 1_200_000,
  },
  avatarUploadUser: {
    capacity: 6,
    refillMilliseconds: 60_000,
    ttlMilliseconds: 720_000,
  },
  reportCreateUser: {
    capacity: 10,
    refillMilliseconds: 60_000,
    ttlMilliseconds: 1_200_000,
  },
} satisfies Record<string, TokenBucketPolicy>;

export type HttpRateLimitPolicy = keyof typeof httpRateLimitPolicies;
export type HttpIdentityPolicy = 'avatarUploadUser' | 'reportCreateUser';
export type HttpWindowPolicy = 'registrationEmail' | 'signInEmailFailures';

const httpWindowPolicies = {
  registrationEmail: { limit: 5, windowMilliseconds: 600_000 },
  signInEmailFailures: { limit: 10, windowMilliseconds: 600_000 },
} satisfies Record<
  HttpWindowPolicy,
  { limit: number; windowMilliseconds: number }
>;

const reserveWindowScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local reservation = ARGV[3]
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
if redis.call('ZCARD', key) >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return math.max(1, window - (now - tonumber(oldest[2])))
end
redis.call('ZADD', key, now, reservation)
redis.call('PEXPIRE', key, window)
return 0
`;

const releaseWindowScript = `return redis.call('ZREM', KEYS[1], ARGV[1])`;

@Injectable()
export class HttpRateLimiter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HttpRateLimiter.name);
  private readonly commands: RedisClientType;
  private readonly keyPrefix: string;
  private readonly useInMemory: boolean;
  private readonly inMemoryBuckets = new Map<
    string,
    { tokens: number; updatedAt: number }
  >();
  private readonly inMemoryWindows = new Map<
    string,
    { reservationId: string; at: number }[]
  >();

  public constructor() {
    const configuration = resolveRedisConfiguration({
      keyPrefix: process.env.REDIS_KEY_PREFIX,
      nodeEnvironment: process.env.NODE_ENV,
      redisUrl: process.env.REDIS_URL,
    });
    this.keyPrefix = configuration.keyPrefix;
    this.useInMemory =
      process.env.NODE_ENV === 'test' && process.env.REDIS_URL === undefined;
    this.commands = createClient({
      disableOfflineQueue: true,
      url: configuration.redisUrl,
    });
    this.commands.on('error', (error) =>
      this.logger.error('Redis HTTP rate limit connection error', error),
    );
  }

  public async onModuleInit(): Promise<void> {
    if (!this.useInMemory) await this.commands.connect();
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.commands.isOpen) await this.commands.close();
  }

  public async consume(
    policyName: HttpRateLimitPolicy,
    ip: string,
  ): Promise<number | undefined> {
    const policy = httpRateLimitPolicies[policyName];
    const ipHash = createHash('sha256').update(ip).digest('hex');
    const key = `${this.keyPrefix}:rate-limit:http:${policyName}:ip:${ipHash}`;

    if (this.useInMemory) {
      return consumeInMemoryToken(this.inMemoryBuckets, key, policy);
    }

    const result = await this.commands.eval(consumeTokenScript, {
      arguments: [
        String(policy.capacity),
        String(policy.refillMilliseconds),
        String(policy.ttlMilliseconds),
      ],
      keys: [key],
    });
    if (typeof result !== 'number' || !Number.isSafeInteger(result)) {
      throw new Error('Redis returned an invalid HTTP rate limit result');
    }
    return result === 0 ? undefined : result;
  }

  public async consumeIdentity(
    policyName: HttpIdentityPolicy,
    identity: string,
  ): Promise<number | undefined> {
    const policy = httpRateLimitPolicies[policyName];
    const key = this.identityKey(policyName, identity);
    if (this.useInMemory) {
      return consumeInMemoryToken(this.inMemoryBuckets, key, policy);
    }
    const result = await this.commands.eval(consumeTokenScript, {
      arguments: [
        String(policy.capacity),
        String(policy.refillMilliseconds),
        String(policy.ttlMilliseconds),
      ],
      keys: [key],
    });
    if (typeof result !== 'number' || !Number.isSafeInteger(result)) {
      throw new Error('Redis returned an invalid HTTP rate limit result');
    }
    return result === 0 ? undefined : result;
  }

  public async reserveIdentity(
    policyName: HttpWindowPolicy,
    identity: string,
  ): Promise<{ reservationId: string } | { retryAfterMs: number }> {
    const policy = httpWindowPolicies[policyName];
    const key = this.identityKey(policyName, identity);
    const reservationId = randomUUID();

    if (this.useInMemory) {
      const now = Date.now();
      const entries = (this.inMemoryWindows.get(key) ?? []).filter(
        ({ at }) => at > now - policy.windowMilliseconds,
      );
      if (entries.length >= policy.limit) {
        this.inMemoryWindows.set(key, entries);
        return {
          retryAfterMs: Math.max(
            1,
            policy.windowMilliseconds - (now - entries[0]!.at),
          ),
        };
      }
      entries.push({ at: now, reservationId });
      this.inMemoryWindows.set(key, entries);
      return { reservationId };
    }

    const result = await this.commands.eval(reserveWindowScript, {
      arguments: [
        String(policy.limit),
        String(policy.windowMilliseconds),
        reservationId,
      ],
      keys: [key],
    });
    if (typeof result !== 'number' || !Number.isSafeInteger(result)) {
      throw new Error('Redis returned an invalid HTTP rate limit result');
    }
    return result === 0 ? { reservationId } : { retryAfterMs: result };
  }

  public async releaseIdentity(
    policyName: HttpWindowPolicy,
    identity: string,
    reservationId: string,
  ): Promise<void> {
    const key = this.identityKey(policyName, identity);
    if (this.useInMemory) {
      const entries = this.inMemoryWindows.get(key) ?? [];
      this.inMemoryWindows.set(
        key,
        entries.filter((entry) => entry.reservationId !== reservationId),
      );
      return;
    }
    await this.commands.eval(releaseWindowScript, {
      arguments: [reservationId],
      keys: [key],
    });
  }

  private identityKey(policyName: string, identity: string): string {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error('BETTER_AUTH_SECRET is required');
    const identityHash = createHmac('sha256', secret)
      .update(`http-rate-limit:${policyName}:${identity}`)
      .digest('hex');
    return `${this.keyPrefix}:rate-limit:http:${policyName}:identity:${identityHash}`;
  }
}
