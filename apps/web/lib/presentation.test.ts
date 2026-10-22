import { describe, expect, it } from 'vitest';

import {
  formatRoomDate,
  normalizeSearchQuery,
  orderRoomsForChannels,
  roomMonogram,
  roomStatusLabel,
  summarizeRooms,
} from './presentation';

describe('room presentation', () => {
  it('turns API room states into audience-facing labels', () => {
    expect(roomStatusLabel('LIVE')).toBe('Live now');
    expect(roomStatusLabel('ENDED')).toBe('Ended');
  });

  it('formats an ISO timestamp for the interface', () => {
    expect(formatRoomDate('2026-10-09T15:30:00.000Z')).toMatch(
      /Oct 9.*(UTC|GMT|EDT|EST)/,
    );
  });

  it('summarizes the currently visible room collection', () => {
    expect(
      summarizeRooms([
        { likeCount: 12, status: 'LIVE' },
        { likeCount: 30, status: 'ENDED' },
        { likeCount: 8, status: 'LIVE' },
      ] as Parameters<typeof summarizeRooms>[0]),
    ).toEqual({ likes: 50, live: 2, replays: 1 });
  });

  it('normalizes search input before requesting rooms', () => {
    expect(normalizeSearchQuery('  design   critique ')).toBe(
      'design critique',
    );
    expect(normalizeSearchQuery(undefined)).toBe('');
    expect(normalizeSearchQuery('x'.repeat(120))).toHaveLength(80);
  });

  it('orders the channel list with live rooms first', () => {
    const rooms = [
      { id: 'a', status: 'ENDED' as const },
      { id: 'b', status: 'LIVE' as const },
      { id: 'c', status: 'ENDED' as const },
      { id: 'd', status: 'LIVE' as const },
    ];

    expect(orderRoomsForChannels(rooms).map((room) => room.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('builds a short monogram for room avatars', () => {
    expect(roomMonogram('Architecture Lab')).toBe('AL');
    expect(roomMonogram('design critique weekly')).toBe('DC');
    expect(roomMonogram('  ')).toBe('LP');
  });
});
