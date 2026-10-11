import type {
  AuditAction,
  AuditLog,
  ModerationReport,
  ReportReason,
} from '@livepulse/contracts';

const reasonLabels: Record<ReportReason, string> = {
  HARASSMENT: 'Harassment',
  HATE_SPEECH: 'Hate speech',
  OTHER: 'Other',
  SPAM: 'Spam',
};

const auditActionLabels: Record<AuditAction, string> = {
  MESSAGE_DELETED: 'Message removed',
  MESSAGE_REPORTED: 'Message reported',
  REPORT_DISMISSED: 'Report dismissed',
  ROOM_USER_MUTED: 'Room user muted',
};

export function reportReasonLabel(reason: ReportReason): string {
  return reasonLabels[reason];
}

export function auditActionLabel(action: AuditAction): string {
  return auditActionLabels[action];
}

export function removeModerationReport(
  reports: ModerationReport[],
  reportId: string,
): ModerationReport[] {
  return reports.filter((report) => report.id !== reportId);
}

export function mergeModerationReports(
  current: ModerationReport[],
  incoming: ModerationReport[],
): ModerationReport[] {
  const reports = new Map(current.map((report) => [report.id, report]));

  for (const report of incoming) {
    reports.set(report.id, report);
  }

  return [...reports.values()];
}

export function mergeAuditLogs(
  current: AuditLog[],
  incoming: AuditLog[],
): AuditLog[] {
  const logs = new Map(current.map((log) => [log.id, log]));

  for (const log of incoming) {
    logs.set(log.id, log);
  }

  return [...logs.values()];
}
