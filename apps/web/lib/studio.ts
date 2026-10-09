import type { Room } from '@livepulse/contracts';

export function nextRoomStatus(
  status: Room['status'],
): 'ENDED' | 'LIVE' | undefined {
  if (status === 'DRAFT') {
    return 'LIVE';
  }

  if (status === 'LIVE') {
    return 'ENDED';
  }

  return undefined;
}

export function roomActionLabel(status: Room['status']): string | undefined {
  if (status === 'DRAFT') {
    return 'Go live';
  }

  if (status === 'LIVE') {
    return 'End broadcast';
  }

  return undefined;
}

export function replaceRoom(rooms: Room[], updated: Room): Room[] {
  return rooms.map((room) => (room.id === updated.id ? updated : room));
}
