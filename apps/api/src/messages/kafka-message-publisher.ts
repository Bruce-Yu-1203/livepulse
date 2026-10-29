import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { RoomMessage } from '@livepulse/contracts';
import { createClient } from 'redis';

import {
  deletedMessageText,
  messagePayloadHash,
} from './messages.repository.js';
import type { RealtimeMessagePublisher } from './messages.service.js';
import { kafkaMessageConfig } from './kafka-message-config.js';
import { resolveRedisConfiguration } from '../rate-limit/redis-configuration.js';

const pendingTtlMilliseconds = 30_000;
const acceptedTtlSeconds = 7 * 24 * 60 * 60;
const releasePendingScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

interface AdmissionState {
  hash: string;
  message: RoomMessage;
  status: 'accepted' | 'pending';
  token: string;
}

@Injectable()
export class KafkaMessagePublisher
  implements RealtimeMessagePublisher, OnModuleInit, OnModuleDestroy
{
  private readonly config = kafkaMessageConfig();
  private readonly producer = this.config.kafka.producer({
    allowAutoTopicCreation: false,
  });
  private readonly redisConfig = resolveRedisConfiguration({
    keyPrefix: process.env.REDIS_KEY_PREFIX,
    nodeEnvironment: process.env.NODE_ENV,
    redisUrl: process.env.REDIS_URL,
  });
  private readonly redis = createClient({
    disableOfflineQueue: true,
    url: this.redisConfig.redisUrl,
  });

  public async onModuleInit(): Promise<void> {
    this.redis.on('error', () => undefined);
    await Promise.all([this.producer.connect(), this.redis.connect()]);
  }

  public async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.producer.disconnect(),
      this.redis.isOpen ? this.redis.close() : Promise.resolve(),
    ]);
  }

  public async publish(
    message: RoomMessage,
  ): ReturnType<RealtimeMessagePublisher['publish']> {
    const key = this.key(message.messageId);
    const hash = messagePayloadHash(message);
    const token = randomUUID();
    const pending: AdmissionState = { hash, message, status: 'pending', token };
    const pendingValue = JSON.stringify(pending);
    const reserved = await this.redis.set(key, pendingValue, {
      NX: true,
      PX: pendingTtlMilliseconds,
    });

    if (reserved !== 'OK') {
      const value = await this.redis.get(key);
      if (!value) {
        throw new Error('Message admission is being retried');
      }
      const existing = JSON.parse(value) as AdmissionState;
      if (existing.hash !== hash) {
        return { kind: 'conflict' };
      }
      if (existing.status === 'pending') {
        throw new Error('Message admission is in progress');
      }
      if (
        await this.redis.exists(
          `${this.redisConfig.keyPrefix}:message-deleted:${message.messageId}`,
        )
      ) {
        return { kind: 'conflict' };
      }
      return { kind: 'duplicate', message: existing.message };
    }

    try {
      await this.producer.send({
        acks: -1,
        messages: [{ key: message.roomId, value: JSON.stringify(message) }],
        topic: this.config.topic,
      });
      const accepted: AdmissionState = { ...pending, status: 'accepted' };
      await this.redis.set(key, JSON.stringify(accepted), {
        EX: acceptedTtlSeconds,
      });
      return { kind: 'queued', message };
    } catch (error) {
      await this.redis
        .eval(releasePendingScript, {
          arguments: [pendingValue],
          keys: [key],
        })
        .catch(() => undefined);
      throw error;
    }
  }

  public async findAccepted(
    messageId: string,
  ): Promise<RoomMessage | undefined> {
    const value = await this.redis.get(this.key(messageId));
    if (!value) return undefined;
    const state = JSON.parse(value) as AdmissionState;
    if (state.status !== 'accepted') return undefined;
    const deletedAt = await this.redis.get(
      `${this.redisConfig.keyPrefix}:message-deleted:${messageId}`,
    );
    return deletedAt
      ? { ...state.message, deletedAt, text: deletedMessageText }
      : state.message;
  }

  private key(messageId: string): string {
    return `${this.redisConfig.keyPrefix}:message-admission:${messageId}`;
  }
}
