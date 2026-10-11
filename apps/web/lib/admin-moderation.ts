import type { ModerationReport, ReportReason } from '@livepulse/contracts';

const reasonLabels: Record<ReportReason, string> = {
  HARASSMENT: 'Harassment',
  HATE_SPEECH: 'Hate speech',
  OTHER: 'Other',
  SPAM: 'Spam',
};

export function reportReasonLabel(reason: ReportReason): string {
  return reasonLabels[reason];
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
