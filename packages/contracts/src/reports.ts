import { z } from 'zod';

export const ReportReasonSchema = z.enum([
  'SPAM',
  'HARASSMENT',
  'HATE_SPEECH',
  'OTHER',
]);

export type ReportReason = z.infer<typeof ReportReasonSchema>;

export const ReportStatusSchema = z.enum(['PENDING', 'ACTIONED', 'DISMISSED']);

export const CreateReportRequestSchema = z
  .object({
    details: z.string().trim().min(1).max(500).optional(),
    messageId: z.uuid(),
    reason: ReportReasonSchema,
    roomId: z.uuid(),
  })
  .strict();

export type CreateReportRequest = z.infer<typeof CreateReportRequestSchema>;

export const ReportSchema = z
  .object({
    createdAt: z.iso.datetime(),
    details: z.string().max(500).nullable(),
    id: z.uuid(),
    messageId: z.uuid(),
    reason: ReportReasonSchema,
    reporterId: z.uuid(),
    roomId: z.uuid(),
    status: ReportStatusSchema,
  })
  .strict();

export type Report = z.infer<typeof ReportSchema>;

export const CreateReportResponseSchema = z
  .object({
    report: ReportSchema,
    requestId: z.string().min(1),
  })
  .strict();

export type CreateReportResponse = z.infer<typeof CreateReportResponseSchema>;
