import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { RoomMessage } from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { KafkaMessagePublisher } from '../src/messages/kafka-message-publisher.js';
import { kafkaMessageConfig } from '../src/messages/kafka-message-config.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error('DATABASE_URL is required for the Kafka integration test');

const database = createDatabaseClient(databaseUrl);
const roomId = randomUUID();
const authorId = randomUUID();
const hostId = randomUUID();
const prefix = `livepulse-kafka-test-${randomUUID()}`;
const topic = `livepulse.integration.${randomUUID().replaceAll('-', '')}`;
const workers: ChildProcess[] = [];
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

describe('Kafka message pipeline', () => {
  let publisher: KafkaMessagePublisher;
  const broadcasts: RoomMessage[] = [];

  beforeAll(async () => {
    process.env.KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9094';
    process.env.KAFKA_MESSAGES_TOPIC = topic;
    process.env.REDIS_KEY_PREFIX = prefix;
    const admin = kafkaMessageConfig().kafka.admin();
    await admin.connect();
    try {
      await admin.createTopics({
        topics: [{ topic, numPartitions: 3, replicationFactor: 1 }],
      });
    } finally {
      await admin.disconnect();
    }
    await database.user.createMany({
      data: [
        {
          email: `${authorId}@example.com`,
          id: authorId,
          name: 'Kafka author',
          role: 'VIEWER',
        },
        {
          email: `${hostId}@example.com`,
          id: hostId,
          name: 'Kafka host',
          role: 'HOST',
        },
      ],
    });
    await database.room.create({
      data: {
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
        description: 'Kafka integration room',
        hostId,
        id: roomId,
        status: 'LIVE',
        title: 'Kafka integration room',
      },
    });
    await redis.connect();
    await redis.subscribe(`${prefix}:room-events`, (raw) => {
      const event = JSON.parse(raw) as { type: string; payload: RoomMessage };
      if (event.type === 'message.created') broadcasts.push(event.payload);
    });
    workers.push(startWorker('broadcast', prefix));
    workers.push(startWorker('persistence', prefix));
    await Promise.all(workers.map(waitForSubscribed));
    publisher = new KafkaMessagePublisher();
    await publisher.onModuleInit();
  }, 30_000);

  afterAll(async () => {
    await publisher?.onModuleDestroy();
    for (const worker of workers) worker.kill('SIGTERM');
    await redis.quit();
    await database.room.deleteMany({ where: { id: roomId } });
    await database.user.deleteMany({
      where: { id: { in: [authorId, hostId] } },
    });
    await database.$disconnect();
    const admin = kafkaMessageConfig().kafka.admin();
    await admin.connect();
    try {
      await admin.deleteTopics({ topics: [topic] });
    } finally {
      await admin.disconnect();
    }
  }, 30_000);

  it('broadcasts once and persists independently with a committed Kafka offset', async () => {
    const message: RoomMessage = {
      acceptedAt: new Date().toISOString(),
      authorId,
      clientMessageId: randomUUID(),
      messageId: randomUUID(),
      roomId,
      text: 'Kafka pipeline test',
    };

    await expect(publisher.publish(message)).resolves.toEqual({
      kind: 'queued',
      message,
    });
    await expect(publisher.publish(message)).resolves.toEqual({
      kind: 'duplicate',
      message,
    });
    await expect(
      publisher.publish({ ...message, text: 'Changed' }),
    ).resolves.toEqual({ kind: 'conflict' });

    await waitUntil(async () =>
      broadcasts.some((item) => item.messageId === message.messageId),
    );
    await waitUntil(async () =>
      Boolean(
        await database.danmakuMessage.findUnique({
          where: { id: message.messageId },
        }),
      ),
    );
    const stored = await database.danmakuMessage.findUniqueOrThrow({
      where: { id: message.messageId },
    });
    expect(stored.kafkaPartition).not.toBeNull();
    expect(stored.kafkaOffset).not.toBeNull();
    expect(
      broadcasts.filter((item) => item.messageId === message.messageId),
    ).toHaveLength(1);
  }, 30_000);

  it('drains a same-room batch through both consumer groups', async () => {
    const messages: RoomMessage[] = Array.from({ length: 30 }, (_, index) => ({
      acceptedAt: new Date().toISOString(),
      authorId,
      clientMessageId: randomUUID(),
      messageId: randomUUID(),
      roomId,
      text: `Batch message ${index}`,
    }));
    const config = kafkaMessageConfig();
    const producer = config.kafka.producer({ allowAutoTopicCreation: false });
    await producer.connect();
    try {
      await producer.send({
        acks: -1,
        messages: messages.map((message) => ({
          key: roomId,
          value: JSON.stringify(message),
        })),
        topic: config.topic,
      });
      const ids = new Set(messages.map(({ messageId }) => messageId));
      await waitUntil(
        () =>
          broadcasts.filter(({ messageId }) => ids.has(messageId)).length ===
          messages.length,
      );
      await waitUntil(
        async () =>
          (await database.danmakuMessage.count({
            where: { id: { in: [...ids] } },
          })) === messages.length,
      );
      expect(
        broadcasts.filter(({ messageId }) => ids.has(messageId)),
      ).toHaveLength(messages.length);
    } finally {
      await producer.disconnect();
    }
  }, 45_000);
});

function startWorker(
  role: 'broadcast' | 'persistence',
  keyPrefix: string,
): ChildProcess {
  return spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          `../dist/messages/${role === 'broadcast' ? 'broadcast' : 'persistence'}-main.js`,
          import.meta.url,
        ),
      ),
    ],
    {
      env: {
        ...process.env,
        KAFKA_BROADCAST_GROUP: `${keyPrefix}-broadcast`,
        KAFKA_PERSISTENCE_GROUP: `${keyPrefix}-persistence`,
        REDIS_KEY_PREFIX: keyPrefix,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function waitForSubscribed(worker: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Kafka worker did not subscribe')),
      20_000,
    );
    worker.once('exit', (code) =>
      reject(new Error(`Kafka worker exited with ${code}`)),
    );
    worker.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('worker subscribed')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    worker.stderr?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('worker failed')) {
        clearTimeout(timeout);
        reject(new Error(chunk.toString()));
      }
    });
  });
}

async function waitUntil(
  predicate: () => Promise<boolean> | boolean,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Kafka pipeline result timed out');
}
