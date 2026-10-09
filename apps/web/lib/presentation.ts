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
  return status === 'LIVE' ? 'Live now' : 'Replay';
}
