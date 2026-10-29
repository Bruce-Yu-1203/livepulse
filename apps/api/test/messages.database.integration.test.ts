import type { RoomMessage } from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseService } from '../src/database/database.service.js';
import { PostgresMessagesRepository } from '../src/messages/messages.repository.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for message database tests');
}

const database = createDatabaseClient(databaseUrl);
const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const authorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const hostId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('PostgreSQL message history', () => {
  const repository = new PostgresMessagesRepository({
    client: database,
  } as DatabaseService);

  beforeAll(async () => {
    await removeFixtures();
    await database.user.createMany({
      data: [
        {
          email: 'message-author@example.com',
          id: authorId,
          name: 'Message author',
          role: 'VIEWER',
        },
        {
          email: 'message-host@example.com',
          id: hostId,
          name: 'Message host',
          role: 'HOST',
        },
      ],
    });
    await database.room.create({
      data: {
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
        description: 'A room with PostgreSQL message history.',
        hostId,
        id: roomId,
        status: 'LIVE',
        title: 'Message history room',
      },
    });
  });

  afterAll(async () => {
    await removeFixtures();
    await database.$disconnect();
  });

  it('persists idempotently and detects a conflicting retry', async () => {
    const original = message(1, '2026-10-18T20:00:01.000Z');

    await expect(repository.create(original)).resolves.toMatchObject({
      kind: 'created',
    });
    await expect(
      repository.create({
        ...original,
        acceptedAt: '2026-10-18T20:00:02.000Z',
      }),
    ).resolves.toEqual({
      kind: 'duplicate',
      message: original,
    });
    await expect(
      repository.create({ ...original, text: 'Changed payload' }),
    ).resolves.toEqual({ kind: 'conflict' });

    await expect(
      database.danmakuMessage.findUniqueOrThrow({
        where: { id: original.messageId },
      }),
    ).resolves.toMatchObject({
      expiresAt: new Date('2026-10-25T20:00:01.000Z'),
      payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('reads deterministic newest-first pages for cursor pagination', async () => {
    await repository.create(message(2, '2026-10-18T20:00:02.000Z'));
    await repository.create(message(3, '2026-10-18T20:00:03.000Z'));

    const page = await repository.list({ roomId, take: 2 });

    expect(page.map(({ text }) => text)).toEqual(['Message 3', 'Message 2']);
    await expect(
      repository.list({
        cursor: {
          acceptedAt: new Date(page[1]?.acceptedAt ?? ''),
          messageId: page[1]?.messageId ?? '',
        },
        roomId,
        take: 2,
      }),
    ).resolves.toMatchObject([{ text: 'Message 1' }]);
  });

  it('finds a message only when both its room and identifier match', async () => {
    const stored = message(4, '2026-10-18T20:00:04.000Z');
    await repository.create(stored);

    await expect(
      repository.findById(roomId, stored.messageId),
    ).resolves.toEqual(stored);
    await expect(
      repository.findById(
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        stored.messageId,
      ),
    ).resolves.toBeUndefined();
  });

  it('replaces prohibited text with a persistent tombstone', async () => {
    const stored = message(5, '2026-10-18T20:00:05.000Z');
    const deletedAt = new Date('2026-10-18T21:00:00.000Z');
    await repository.create(stored);

    await expect(
      repository.delete(roomId, stored.messageId, deletedAt),
    ).resolves.toMatchObject({
      deletedAt: deletedAt.toISOString(),
      messageId: stored.messageId,
      text: 'Message removed by moderation',
    });
    await expect(
      repository.findById(roomId, stored.messageId),
    ).resolves.toMatchObject({
      deletedAt: deletedAt.toISOString(),
      text: 'Message removed by moderation',
    });
    await expect(repository.create(stored)).resolves.toEqual({
      kind: 'conflict',
    });
  });

  it('persists Kafka offsets and preserves deletion before delayed insertion', async () => {
    const original = message(6, '2026-10-18T20:00:06.000Z');
    const deletedAt = new Date('2026-10-18T20:01:00.000Z');
    await repository.deletePending(original, deletedAt);
    await repository.persistKafka(original, 3, 42n);
    await repository.persistKafka(original, 3, 42n);

    await expect(
      database.danmakuMessage.findUniqueOrThrow({
        where: { id: original.messageId },
      }),
    ).resolves.toMatchObject({
      deletedAt,
      kafkaOffset: 42n,
      kafkaPartition: 3,
      text: 'Message removed by moderation',
    });
    await expect(
      repository.persistKafka({ ...original, text: 'Different' }, 3, 43n),
    ).rejects.toThrow();
  });

  it('skips replayed messages whose room or author has been deleted', async () => {
    const missingRoom = {
      ...message(7, '2026-10-18T20:00:07.000Z'),
      roomId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    };
    const missingAuthor = {
      ...message(8, '2026-10-18T20:00:08.000Z'),
      authorId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    };
    await expect(
      repository.persistKafka(missingRoom, 1, 10n),
    ).resolves.toBeUndefined();
    await expect(
      repository.persistKafka(missingAuthor, 1, 11n),
    ).resolves.toBeUndefined();
  });
});

function message(index: number, acceptedAt: string): RoomMessage {
  return {
    acceptedAt,
    authorId,
    clientMessageId: uuid(index + 100),
    messageId: uuid(index),
    roomId,
    text: `Message ${index}`,
  };
}

async function removeFixtures(): Promise<void> {
  await database.messageTombstone.deleteMany({ where: { roomId } });
  await database.room.deleteMany({ where: { id: roomId } });
  await database.user.deleteMany({
    where: { id: { in: [authorId, hostId] } },
  });
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}
