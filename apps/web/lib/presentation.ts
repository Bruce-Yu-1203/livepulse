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
