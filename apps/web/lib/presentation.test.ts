import { describe, expect, it } from 'vitest';

import {
  avatarTone,
  avatarToneCount,
  formatRoomDate,
  normalizeSearchQuery,
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

  it('builds a short monogram for room avatars', () => {
    expect(roomMonogram('Architecture Lab')).toBe('AL');
    expect(roomMonogram('design critique weekly')).toBe('DC');
    expect(roomMonogram('  ')).toBe('LP');
  });
});

describe('avatarTone', () => {
  it('returns the same tone for the same name and stays in range', () => {
    expect(avatarTone('Architecture Lab')).toBe(avatarTone('Architecture Lab'));
    for (const name of ['a', 'Speedrun practice', '水彩', '']) {
      const tone = avatarTone(name);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(avatarToneCount);
    }
  });
});
