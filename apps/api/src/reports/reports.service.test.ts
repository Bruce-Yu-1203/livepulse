import type { RoomMessage } from '@livepulse/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';
import type { MessagesService } from '../messages/messages.service.js';
import type { RealtimeEventBus } from '../realtime/realtime-coordination.js';
import {
  ReportAlreadyActionedError,
  ReportMessageNotFoundError,
  ReportNotFoundError,
  ReportOwnMessageError,
} from './reports.errors.js';
import type { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const messageId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const authorId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const reporterId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const reportId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('ReportsService', () => {
  it('verifies the message and creates an attributed report', async () => {
    const repository = reportsRepository();
    vi.mocked(repository.create).mockResolvedValue({
      createdAt: new Date('2026-10-10T21:00:00.000Z'),
      details: 'Repeated links',
      id: reportId,
      messageId,
      reason: 'SPAM',
      reporterId,
      roomId,
      status: 'PENDING',
    });
    const messages = messagesService(message());
    const service = new ReportsService(repository, messages, eventBus());

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
    const missing = new ReportsService(
      repository,
      messagesService(undefined),
      eventBus(),
    );

    await expect(
      missing.create(principal(reporterId), {
        messageId,
        reason: 'OTHER',
        roomId,
      }),
    ).rejects.toBeInstanceOf(ReportMessageNotFoundError);

    const own = new ReportsService(
      repository,
      messagesService(message()),
      eventBus(),
    );
    await expect(
      own.create(principal(authorId), {
        messageId,
        reason: 'HARASSMENT',
        roomId,
      }),
    ).rejects.toBeInstanceOf(ReportOwnMessageError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('hydrates the pending queue with MongoDB message snapshots', async () => {
    const repository = reportsRepository();
    const report = {
      createdAt: new Date('2026-10-10T21:00:00.000Z'),
      details: null,
      id: reportId,
      messageId,
      reason: 'SPAM' as const,
      reporterId,
      roomId,
      status: 'PENDING' as const,
    };
    vi.mocked(repository.listPending).mockResolvedValue([report]);
    const service = new ReportsService(
      repository,
      messagesService(message()),
      eventBus(),
    );

    await expect(service.listPending()).resolves.toEqual([
      { message: message(), report },
    ]);
    expect(repository.listPending).toHaveBeenCalledWith(50);
  });

  it('writes a tombstone, actions reports, and publishes a deletion event', async () => {
    const repository = reportsRepository();
    const messages = messagesService(message());
    vi.mocked(messages.delete).mockResolvedValue({
      ...message(),
      deletedAt: '2026-10-11T01:00:00.000Z',
      text: 'Message removed by moderation',
    });
    const bus = eventBus();
    const service = new ReportsService(repository, messages, bus);

    await service.deleteMessage(principal(reporterId), roomId, messageId);

    expect(messages.delete).toHaveBeenCalledWith(
      roomId,
      messageId,
      expect.any(Date),
    );
    expect(repository.recordDeletion).toHaveBeenCalledWith({
      actorId: reporterId,
      deletedAt: expect.any(Date),
      messageId,
      roomId,
    });
    expect(bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ messageId, roomId }),
        type: 'message.deleted',
      }),
    );
  });

  it('dismisses a pending report without changing its message', async () => {
    const repository = reportsRepository();
    vi.mocked(repository.dismiss).mockResolvedValue('dismissed');
    const messages = messagesService(message());
    const service = new ReportsService(repository, messages, eventBus());

    await service.dismiss(principal(reporterId), reportId);

    expect(repository.dismiss).toHaveBeenCalledWith({
      actorId: reporterId,
      dismissedAt: expect.any(Date),
      reportId,
    });
    expect(messages.delete).not.toHaveBeenCalled();
  });

  it('distinguishes missing reports from reports already actioned', async () => {
    const missingRepository = reportsRepository();
    vi.mocked(missingRepository.dismiss).mockResolvedValue('missing');
    const missing = new ReportsService(
      missingRepository,
      messagesService(message()),
      eventBus(),
    );
    await expect(
      missing.dismiss(principal(reporterId), reportId),
    ).rejects.toBeInstanceOf(ReportNotFoundError);

    const actionedRepository = reportsRepository();
    vi.mocked(actionedRepository.dismiss).mockResolvedValue('actioned');
    const actioned = new ReportsService(
      actionedRepository,
      messagesService(message()),
      eventBus(),
    );
    await expect(
      actioned.dismiss(principal(reporterId), reportId),
    ).rejects.toBeInstanceOf(ReportAlreadyActionedError);
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
    delete: vi.fn(),
    findById: vi.fn().mockResolvedValue(stored),
  } as unknown as MessagesService & { findById: ReturnType<typeof vi.fn> };
}

function reportsRepository(): ReportsRepository {
  return {
    create: vi.fn(),
    dismiss: vi.fn(),
    listPending: vi.fn(),
    recordDeletion: vi.fn().mockResolvedValue(undefined),
  };
}

function eventBus(): RealtimeEventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
  };
}

function principal(userId: string): AuthenticatedPrincipal {
  return {
    role: 'VIEWER',
    sessionId: '11111111-1111-4111-8111-111111111111',
    userId,
  };
}
