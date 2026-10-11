import { describe, expect, it } from 'vitest';

import {
  CreateReportRequestSchema,
  CreateReportResponseSchema,
  ListReportsResponseSchema,
  ModerateMessageParamsSchema,
} from './reports.js';

const messageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const roomId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('message report contracts', () => {
  it('accepts a strict report request and response', () => {
    expect(
      CreateReportRequestSchema.parse({
        details: 'Repeated unsolicited links',
        messageId,
        reason: 'SPAM',
        roomId,
      }),
    ).toEqual({
      details: 'Repeated unsolicited links',
      messageId,
      reason: 'SPAM',
      roomId,
    });

    const response = {
      report: {
        createdAt: '2026-10-10T21:00:00.000Z',
        details: null,
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        messageId,
        reason: 'HARASSMENT',
        reporterId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        roomId,
        status: 'PENDING',
      },
      requestId: 'request-report-1',
    };

    expect(CreateReportResponseSchema.parse(response)).toEqual(response);
  });

  it.each([
    { messageId, reason: 'UNKNOWN', roomId },
    { details: '', messageId, reason: 'OTHER', roomId },
    { details: 'x'.repeat(501), messageId, reason: 'OTHER', roomId },
    { messageId: 'invalid', reason: 'SPAM', roomId },
    { extra: true, messageId, reason: 'SPAM', roomId },
  ])('rejects an invalid report request: %o', (request) => {
    expect(CreateReportRequestSchema.safeParse(request).success).toBe(false);
  });

  it('accepts an administrator queue item with its message snapshot', () => {
    const response = {
      items: [
        {
          createdAt: '2026-10-10T21:00:00.000Z',
          details: 'Repeated links',
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          message: {
            acceptedAt: '2026-10-10T20:59:00.000Z',
            authorId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            clientMessageId: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
            messageId,
            roomId,
            text: 'Suspicious content',
          },
          messageId,
          reason: 'SPAM',
          reporterId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          roomId,
          status: 'PENDING',
        },
      ],
      requestId: 'request-list-reports',
    };

    expect(ListReportsResponseSchema.parse(response)).toEqual(response);
  });

  it('requires valid room and message identifiers for deletion', () => {
    expect(ModerateMessageParamsSchema.parse({ messageId, roomId })).toEqual({
      messageId,
      roomId,
    });
    expect(
      ModerateMessageParamsSchema.safeParse({ messageId, roomId: 'invalid' })
        .success,
    ).toBe(false);
  });
});
