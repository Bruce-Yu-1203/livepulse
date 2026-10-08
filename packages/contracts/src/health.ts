import { z } from 'zod';

export const HealthResponseSchema = z.object({
  service: z.string().min(1),
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
