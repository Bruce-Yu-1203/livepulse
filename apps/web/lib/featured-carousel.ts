import type { VisibleRoom } from '@livepulse/contracts';

export const featuredRoomLimit = 5;

/** How long each featured room stays before the carousel advances. */
export const featuredAutoplayMs = 6000;

export function selectFeaturedRooms<T extends Pick<VisibleRoom, 'status'>>(
  rooms: T[],
  limit = featuredRoomLimit,
): T[] {
  const live = rooms.filter((room) => room.status === 'LIVE');
  return (live.length > 0 ? live : rooms).slice(0, limit);
}

export function wrapIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  return ((index % length) + length) % length;
}

export function carouselNeighbors(
  index: number,
  length: number,
): { next: number; previous: number } | undefined {
  if (length < 2) {
    return undefined;
  }

  return {
    next: wrapIndex(index + 1, length),
    previous: wrapIndex(index - 1, length),
  };
}
