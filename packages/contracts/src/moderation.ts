import { z } from 'zod';

export const MuteRoomUserRequestSchema = z
  .object({
    durationMinutes: z.number().int().min(1).max(1_440),
    userId: z.uuid(),
  })
  .strict();

export type MuteRoomUserRequest = z.infer<typeof MuteRoomUserRequestSchema>;

export const RoomMuteSchema = z
  .object({
    effectiveAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    mutedBy: z.uuid(),
    roomId: z.uuid(),
    userId: z.uuid(),
  })
  .strict();

export type RoomMute = z.infer<typeof RoomMuteSchema>;

export const MuteRoomUserResponseSchema = z
  .object({
    mute: RoomMuteSchema,
    requestId: z.string().min(1),
  })
  .strict();

export type MuteRoomUserResponse = z.infer<typeof MuteRoomUserResponseSchema>;
