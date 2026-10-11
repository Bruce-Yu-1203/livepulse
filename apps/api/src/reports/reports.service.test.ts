import type { RoomMessage } from '@livepulse/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';
import type { MessagesService } from '../messages/messages.service.js';
import {
  ReportMessageNotFoundError,
  ReportOwnMessageError,
} from './reports.errors.js';
import type { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const messageId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const authorId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const reporterId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('ReportsService', () => {
  it('verifies the message and creates an attributed report', async () => {
    const repository = reportsRepository();
    vi.mocked(repository.create).mockResolvedValue({
      createdAt: new Date('2026-10-10T21:00:00.000Z'),
      details: 'Repeated links',
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      messageId,
      reason: 'SPAM',
      reporterId,
      roomId,
      status: 'PENDING',
    });
    const messages = messagesService(message());
    const service = new ReportsService(repository, messages);

    await expect(
      service.create(principal(reporterId), {
        details: 'Repeated links',
        messageId,
        reason: 'SPAM',
        roomId,
      }),
    ).resolves.toMatchObject({ messageId, reporterId, status: 'PENDING' });
    expect(messages.findById).toHaveBeenCalledWith(roomId, messageId);
    expect(repository.create).toHaveBeenCalledWith({
      details: 'Repeated links',
      messageId,
      reason: 'SPAM',
      reporterId,
      roomId,
    });
  });

  it('rejects a missing message and an author reporting themselves', async () => {
    const repository = reportsRepository();
    const missing = new ReportsService(repository, messagesService(undefined));

    await expect(
      missing.create(principal(reporterId), {
        messageId,
        reason: 'OTHER',
        roomId,
      }),
    ).rejects.toBeInstanceOf(ReportMessageNotFoundError);

    const own = new ReportsService(repository, messagesService(message()));
    await expect(
      own.create(principal(authorId), {
        messageId,
        reason: 'HARASSMENT',
        roomId,
      }),
    ).rejects.toBeInstanceOf(ReportOwnMessageError);
    expect(repository.create).not.toHaveBeenCalled();
  });
});

function message(): RoomMessage {
  return {
    acceptedAt: '2026-10-10T20:59:00.000Z',
    authorId,
    clientMessageId: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
    messageId,
    roomId,
    text: 'A reportable message',
  };
}

function messagesService(
  stored: RoomMessage | undefined,
): MessagesService & { findById: ReturnType<typeof vi.fn> } {
  return {
    findById: vi.fn().mockResolvedValue(stored),
  } as unknown as MessagesService & { findById: ReturnType<typeof vi.fn> };
}

function reportsRepository(): ReportsRepository {
  return { create: vi.fn() };
}

function principal(userId: string): AuthenticatedPrincipal {
  return {
    role: 'VIEWER',
    sessionId: '11111111-1111-4111-8111-111111111111',
    userId,
  };
}
