import { z } from 'zod';

export const BroadcastConnectionResponseSchema = z
  .object({
    participantToken: z.string().min(1),
    requestId: z.string().min(1),
    serverUrl: z.string().url(),
  })
  .strict();

export type BroadcastConnectionResponse = z.infer<
  typeof BroadcastConnectionResponseSchema
>;
