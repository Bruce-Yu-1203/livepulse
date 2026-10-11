import type { RoomStatus, UserRole } from '@livepulse/contracts';

export function canModerateRoom(
  role: UserRole | undefined,
  userId: string | undefined,
  hostId: string,
  status: RoomStatus,
): boolean {
  if (status !== 'LIVE' || !userId) {
    return false;
  }

  return role === 'ADMIN' || (role === 'HOST' && userId === hostId);
}
