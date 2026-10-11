import { z } from 'zod';

export const AuditActionSchema = z.enum([
  'MESSAGE_DELETED',
  'MESSAGE_REPORTED',
  'REPORT_DISMISSED',
  'ROOM_USER_MUTED',
]);

export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditLogSchema = z
  .object({
    action: AuditActionSchema,
    actorId: z.uuid(),
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    roomId: z.uuid().nullable(),
    targetId: z.uuid(),
  })
  .strict();

export type AuditLog = z.infer<typeof AuditLogSchema>;

export const ListAuditLogsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type ListAuditLogsQuery = z.infer<typeof ListAuditLogsQuerySchema>;

export const ListAuditLogsResponseSchema = z
  .object({
    items: z.array(AuditLogSchema),
    nextCursor: z.string().min(1).nullable(),
    requestId: z.string().min(1),
  })
  .strict();

export type ListAuditLogsResponse = z.infer<typeof ListAuditLogsResponseSchema>;
