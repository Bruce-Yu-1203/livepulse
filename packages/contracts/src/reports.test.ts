import { describe, expect, it } from 'vitest';

import {
  CreateReportRequestSchema,
  CreateReportResponseSchema,
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
});
