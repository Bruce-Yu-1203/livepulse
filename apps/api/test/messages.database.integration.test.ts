import type { RoomMessage } from '@livepulse/contracts';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MongoMessagesRepository } from '../src/messages/messages.repository.js';

const mongoUrl = process.env.MONGODB_URL;

if (!mongoUrl) {
  throw new Error('MONGODB_URL is required for message database tests');
}

const databaseName = new URL(mongoUrl).pathname.slice(1);
if (!databaseName.startsWith('livepulse_test_')) {
  throw new Error('Message database tests require an isolated test database');
}

const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('MongoDB message history', () => {
  let repository: MongoMessagesRepository;

  beforeAll(() => {
    repository = new MongoMessagesRepository();
  });

  afterAll(async () => {
    await repository.onModuleDestroy();
    const cleanup = new MongoClient(mongoUrl);
    await cleanup.db().dropDatabase();
    await cleanup.close();
  });

  it('persists idempotently and detects a conflicting retry', async () => {
    const original = message(1, '2026-10-09T20:00:01.000Z');

    await expect(repository.create(original)).resolves.toMatchObject({
      kind: 'created',
    });
    await expect(repository.create(original)).resolves.toEqual({
      kind: 'duplicate',
      message: original,
    });
    await expect(
      repository.create({ ...original, text: 'Changed payload' }),
    ).resolves.toEqual({ kind: 'conflict' });
  });

  it('reads deterministic newest-first pages for cursor pagination', async () => {
    await repository.create(message(2, '2026-10-09T20:00:02.000Z'));
    await repository.create(message(3, '2026-10-09T20:00:03.000Z'));

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
});

function message(index: number, acceptedAt: string): RoomMessage {
  return {
    acceptedAt,
    authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    clientMessageId: uuid(index + 100),
    messageId: uuid(index),
    roomId,
    text: `Message ${index}`,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}
