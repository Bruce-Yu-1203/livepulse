import type { ModerationReport } from '@livepulse/contracts';
import { describe, expect, it } from 'vitest';

import {
  auditActionLabel,
  mergeAuditLogs,
  mergeModerationReports,
  removeModerationReport,
  reportReasonLabel,
} from './admin-moderation';

describe('admin moderation helpers', () => {
  it('formats report reasons for people', () => {
    expect(reportReasonLabel('HATE_SPEECH')).toBe('Hate speech');
    expect(reportReasonLabel('SPAM')).toBe('Spam');
  });

  it('formats audit actions for people', () => {
    expect(auditActionLabel('MESSAGE_DELETED')).toBe('Message removed');
    expect(auditActionLabel('REPORT_DISMISSED')).toBe('Report dismissed');
  });

  it('removes a resolved report without mutating the queue', () => {
    const reports = [report('a'), report('b')];
    const next = removeModerationReport(reports, 'a');

    expect(next.map(({ id }) => id)).toEqual(['b']);
    expect(reports).toHaveLength(2);
  });

  it('appends report pages without duplicating overlapping records', () => {
    const first = report('a');
    const refreshed = { ...first, details: 'Fresh context' };

    expect(mergeModerationReports([first], [refreshed, report('b')])).toEqual([
      refreshed,
      report('b'),
    ]);
  });

  it('appends audit pages without duplicating overlapping records', () => {
    const first = auditLog('a');
    const refreshed = { ...first, action: 'REPORT_DISMISSED' as const };

    expect(mergeAuditLogs([first], [refreshed, auditLog('b')])).toEqual([
      refreshed,
      auditLog('b'),
    ]);
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

function auditLog(id: string) {
  return {
    action: 'MESSAGE_REPORTED' as const,
    actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    createdAt: '2026-10-11T01:00:00.000Z',
    id,
    roomId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    targetId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  };
}
