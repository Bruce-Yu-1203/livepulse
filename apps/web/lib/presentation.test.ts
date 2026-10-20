import { describe, expect, it } from 'vitest';

import {
  formatRoomDate,
  roomStatusLabel,
  summarizeRooms,
} from './presentation';

describe('room presentation', () => {
  it('turns API room states into audience-facing labels', () => {
    expect(roomStatusLabel('LIVE')).toBe('Live now');
    expect(roomStatusLabel('ENDED')).toBe('Replay');
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
});
