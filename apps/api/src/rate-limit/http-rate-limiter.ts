import { createHash } from 'node:crypto';

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
    capacity: 20,
    refillMilliseconds: 30_000,
    ttlMilliseconds: 1_200_000,
  },
  registrationComplete: {
    capacity: 30,
    refillMilliseconds: 10_000,
    ttlMilliseconds: 600_000,
  },
  signIn: {
    capacity: 20,
    refillMilliseconds: 15_000,
    ttlMilliseconds: 600_000,
  },
  avatarUpload: {
    capacity: 6,
    refillMilliseconds: 60_000,
    ttlMilliseconds: 720_000,
  },
  reportCreate: {
    capacity: 10,
    refillMilliseconds: 60_000,
    ttlMilliseconds: 1_200_000,
  },
} satisfies Record<string, TokenBucketPolicy>;

export type HttpRateLimitPolicy = keyof typeof httpRateLimitPolicies;

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
}
