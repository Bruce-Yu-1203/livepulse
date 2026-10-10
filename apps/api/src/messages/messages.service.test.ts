import type { RoomMessage } from '@livepulse/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { RoomsService } from '../rooms/rooms.service.js';
import type { MessagesRepository } from './messages.repository.js';
import { MessagesService } from './messages.service.js';

const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('MessagesService', () => {
  it('returns chronological pages with a cursor for older messages', async () => {
    const repository = messagesRepository([
      message(3, '2026-10-09T20:00:03.000Z'),
      message(2, '2026-10-09T20:00:02.000Z'),
      message(1, '2026-10-09T20:00:01.000Z'),
    ]);
    const rooms = roomsService();
    const service = new MessagesService(repository, rooms);

    const page = await service.list(roomId, { limit: 2 });

    expect(rooms.getVisible).toHaveBeenCalledWith(roomId);
    expect(page.items.map(({ text }) => text)).toEqual([
      'Message 2',
      'Message 3',
    ]);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ roomId, take: 3 }),
    );
  });

  it('delegates idempotent realtime publication to the repository', async () => {
    const repository = messagesRepository([]);
    const service = new MessagesService(repository, roomsService());
    const created = message(1, '2026-10-09T20:00:01.000Z');

    vi.mocked(repository.create).mockResolvedValue({
      kind: 'created',
      message: created,
    });

    await expect(service.publish(created)).resolves.toEqual({
      kind: 'created',
      message: created,
    });
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

function messagesRepository(records: RoomMessage[]): MessagesRepository {
  return {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue(records),
  };
}

function roomsService() {
  return {
    getVisible: vi.fn().mockResolvedValue({ id: roomId, status: 'LIVE' }),
  } as unknown as RoomsService & { getVisible: ReturnType<typeof vi.fn> };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}
