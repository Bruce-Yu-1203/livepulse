import { describe, expect, it } from 'vitest';

import { formatRoomDate, roomStatusLabel } from './presentation';

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
});
