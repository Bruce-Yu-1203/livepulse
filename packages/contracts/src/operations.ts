import { z } from 'zod';

export const OperationsSummaryResponseSchema = z
  .object({
    business: z
      .object({
        auditActions: z.number().int().nonnegative(),
        liveRooms: z.number().int().nonnegative(),
        pendingReports: z.number().int().nonnegative(),
        users: z.number().int().nonnegative(),
      })
      .strict(),
    generatedAt: z.iso.datetime(),
    requestId: z.string().min(1),
    runtime: z
      .object({
        acceptedMessages: z.number().int().nonnegative(),
        acceptedMessagesLastMinute: z.number().int().nonnegative(),
        activeConnections: z.number().int().nonnegative(),
        deliveryAttempts: z.number().int().nonnegative(),
        redisFailures: z.number().int().nonnegative(),
        sessionCacheHits: z.number().int().nonnegative(),
        sessionRefreshes: z.number().int().nonnegative(),
        roomCacheHits: z.number().int().nonnegative(),
        roomCacheMisses: z.number().int().nonnegative(),
        muteCacheHits: z.number().int().nonnegative(),
        muteCacheMisses: z.number().int().nonnegative(),
        muteDbFallbacks: z.number().int().nonnegative(),
        muteInvalidationFailures: z.number().int().nonnegative(),
        startedAt: z.iso.datetime(),
      })
      .strict(),
  })
  .strict();

export type OperationsSummaryResponse = z.infer<
  typeof OperationsSummaryResponseSchema
>;
