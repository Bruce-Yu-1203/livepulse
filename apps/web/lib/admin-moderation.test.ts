import type { ModerationReport } from '@livepulse/contracts';
import { describe, expect, it } from 'vitest';

import { removeModerationReport, reportReasonLabel } from './admin-moderation';

describe('admin moderation helpers', () => {
  it('formats report reasons for people', () => {
    expect(reportReasonLabel('HATE_SPEECH')).toBe('Hate speech');
    expect(reportReasonLabel('SPAM')).toBe('Spam');
  });

  it('removes the actioned report without mutating the queue', () => {
    const reports = [report('a'), report('b')];
    const next = removeModerationReport(reports, 'a');

    expect(next.map(({ id }) => id)).toEqual(['b']);
    expect(reports).toHaveLength(2);
  });
});

function report(id: string): ModerationReport {
  return {
    createdAt: '2026-10-11T01:00:00.000Z',
    details: null,
    id,
    message: null,
    messageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    reason: 'SPAM',
    reporterId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    status: 'PENDING',
  };
}
