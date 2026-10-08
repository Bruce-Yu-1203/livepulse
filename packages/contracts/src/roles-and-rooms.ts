import { z } from 'zod';

export const UserRoleSchema = z.enum(['GUEST', 'VIEWER', 'HOST', 'ADMIN']);

export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserRole = UserRoleSchema.enum;

export const RoomStatusSchema = z.enum(['DRAFT', 'LIVE', 'ENDED']);

export type RoomStatus = z.infer<typeof RoomStatusSchema>;

export const RoomStatus = RoomStatusSchema.enum;
