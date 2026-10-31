import type { VisibleRoom } from '@livepulse/contracts';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  timeZoneName: 'short',
});

export function formatRoomDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

export function roomStatusLabel(status: VisibleRoom['status']): string {
  return status === 'LIVE' ? 'Live now' : 'Ended';
}

export function summarizeRooms(rooms: VisibleRoom[]) {
  return rooms.reduce(
    (summary, room) => ({
      likes: summary.likes + room.likeCount,
      live: summary.live + (room.status === 'LIVE' ? 1 : 0),
      replays: summary.replays + (room.status === 'ENDED' ? 1 : 0),
    }),
    { likes: 0, live: 0, replays: 0 },
  );
}

export function normalizeSearchQuery(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/gu, ' ').slice(0, 80);
}

// Live rooms lead the channel list; within each state the API order is kept.
export function orderRoomsForChannels<T extends Pick<VisibleRoom, 'status'>>(
  rooms: T[],
): T[] {
  return [
    ...rooms.filter((room) => room.status === 'LIVE'),
    ...rooms.filter((room) => room.status !== 'LIVE'),
  ];
}

/** Number of avatar colour tones defined in globals.css (.avatar-tone-N). */
export const avatarToneCount = 6;

/** Picks a stable avatar colour tone for a room or user name. */
export function avatarTone(seed: string): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return hash % avatarToneCount;
}

export function roomMonogram(title: string): string {
  const letters = title
    .trim()
    .split(/\s+/u)
    .map((word) => word.charAt(0))
    .filter((letter) => /[\p{L}\p{N}]/u.test(letter))
    .slice(0, 2)
    .join('');

  return letters ? letters.toUpperCase() : 'LP';
}
