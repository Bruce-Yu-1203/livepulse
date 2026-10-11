import { z } from 'zod';

import { RoomMessageSchema } from './messages.js';

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

export const ModerationReportSchema = ReportSchema.extend({
  message: RoomMessageSchema.nullable(),
}).strict();

export type ModerationReport = z.infer<typeof ModerationReportSchema>;

export const ListReportsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type ListReportsQuery = z.infer<typeof ListReportsQuerySchema>;

export const ListReportsResponseSchema = z
  .object({
    items: z.array(ModerationReportSchema),
    nextCursor: z.string().min(1).nullable(),
    requestId: z.string().min(1),
  })
  .strict();

export type ListReportsResponse = z.infer<typeof ListReportsResponseSchema>;

export const ModerateMessageParamsSchema = z
  .object({
    messageId: z.uuid(),
    roomId: z.uuid(),
  })
  .strict();

export const UpdateReportParamsSchema = z
  .object({
    reportId: z.uuid(),
  })
  .strict();

export const UpdateReportRequestSchema = z
  .object({
    status: z.literal('DISMISSED'),
  })
  .strict();

export type UpdateReportRequest = z.infer<typeof UpdateReportRequestSchema>;
