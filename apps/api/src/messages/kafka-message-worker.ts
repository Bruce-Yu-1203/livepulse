import { randomUUID } from 'node:crypto';

import { RoomMessageSchema } from '@livepulse/contracts';
import type { RoomMessage } from '@livepulse/contracts';
import { createClient } from 'redis';

import { DatabaseService } from '../database/database.service.js';
import { resolveRedisConfiguration } from '../rate-limit/redis-configuration.js';
import { kafkaMessageConfig } from './kafka-message-config.js';
import { PostgresMessagesRepository } from './messages.repository.js';

const broadcastScript = `
if redis.call('EXISTS', KEYS[2]) == 1 then return -2 end
if redis.call('EXISTS', KEYS[1]) == 1 then return -1 end
local receivers = redis.call('PUBLISH', ARGV[1], ARGV[2])
if receivers > 0 then redis.call('SET', KEYS[1], '1', 'EX', ARGV[3]) end
return receivers`;
const messageTtlSeconds = 7 * 24 * 60 * 60;

export function parseKafkaMessage(value: Buffer | null): RoomMessage {
  if (!value) throw new Error('Kafka message has no value');
  const message = RoomMessageSchema.parse(JSON.parse(value.toString('utf8')));
  if (message.deletedAt)
    throw new Error('Kafka message cannot contain deletedAt');
  return message;
}

export async function runKafkaMessageWorker(
  role: 'broadcast' | 'persistence',
): Promise<void> {
  const config = kafkaMessageConfig();
  const consumer = config.kafka.consumer({
    allowAutoTopicCreation: false,
    groupId:
      role === 'broadcast' ? config.broadcastGroup : config.persistenceGroup,
  });
  const redisConfig =
    role === 'broadcast'
      ? resolveRedisConfiguration({
          keyPrefix: process.env.REDIS_KEY_PREFIX,
          nodeEnvironment: process.env.NODE_ENV,
          redisUrl: process.env.REDIS_URL,
        })
      : undefined;
  const redis =
    role === 'broadcast'
      ? createClient({ disableOfflineQueue: true, url: redisConfig!.redisUrl })
      : undefined;
  const database = role === 'persistence' ? new DatabaseService() : undefined;
  const repository = database
    ? new PostgresMessagesRepository(database)
    : undefined;
  redis?.on('error', (error) => console.error('Broadcast Redis error', error));

  const shutdown = async () => {
    await Promise.allSettled([
      consumer.disconnect(),
      redis?.isOpen ? redis.close() : Promise.resolve(),
      database?.onModuleDestroy() ?? Promise.resolve(),
    ]);
  };
  process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
  process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));

  await Promise.all([
    consumer.connect(),
    redis?.connect() ?? Promise.resolve(),
  ]);
  await consumer.subscribe({ fromBeginning: true, topic: config.topic });
  console.info(`${role} worker subscribed to ${config.topic}`);
  let lastLagLog = 0;
  consumer.on(consumer.events.END_BATCH_PROCESS, ({ payload }) => {
    if (Date.now() - lastLagLog < 10_000) return;
    lastLagLog = Date.now();
    console.info(
      `${role} lag ${payload.topic}[${payload.partition}]=${payload.offsetLag}`,
    );
  });
  consumer.on(consumer.events.CRASH, ({ payload }) => {
    console.error(`${role} consumer crashed`, payload.error);
    if (!payload.restart) {
      void shutdown().finally(() => process.exit(1));
    }
  });
  let processed = 0;
  await consumer.run({
    autoCommit: false,
    eachBatchAutoResolve: false,
    partitionsConsumedConcurrently: role === 'broadcast' ? 4 : 2,
    eachBatch: async ({
      batch,
      heartbeat,
      isRunning,
      isStale,
      resolveOffset,
    }) => {
      let lastOffset: string | undefined;
      for (const message of batch.messages) {
        if (!isRunning() || isStale()) return;
        const roomMessage = parseKafkaMessage(message.value);
        if (role === 'broadcast') {
          if (!redis || !redisConfig)
            throw new Error('Broadcast Redis client is missing');
          const event = {
            payload: roomMessage,
            requestId: randomUUID(),
            type: 'message.created',
            v: 1,
          };
          const result = await redis.eval(broadcastScript, {
            arguments: [
              `${redisConfig.keyPrefix}:room-events`,
              JSON.stringify(event),
              String(messageTtlSeconds),
            ],
            keys: [
              `${redisConfig.keyPrefix}:message-broadcast:${roomMessage.messageId}`,
              `${redisConfig.keyPrefix}:message-deleted:${roomMessage.messageId}`,
            ],
          });
          if (result === 0)
            throw new Error('No Redis room subscribers are ready');
        } else {
          if (!repository) throw new Error('Persistence repository is missing');
          await repository.persistKafka(
            roomMessage,
            batch.partition,
            BigInt(message.offset),
          );
        }
        resolveOffset(message.offset);
        lastOffset = message.offset;
        processed += 1;
        await heartbeat();
      }
      if (lastOffset !== undefined) {
        await consumer.commitOffsets([
          {
            offset: (BigInt(lastOffset) + 1n).toString(),
            partition: batch.partition,
            topic: batch.topic,
          },
        ]);
      }
      if (processed > 0 && processed % 1_000 === 0) {
        console.info(`${role} processed ${processed} messages`);
      }
    },
  });
}
