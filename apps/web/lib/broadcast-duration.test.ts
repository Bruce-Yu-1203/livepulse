import { describe, expect, it } from 'vitest';

import { formatBroadcastDuration } from './broadcast-duration';

describe('broadcast duration', () => {
  const startedAt = '2026-10-23T12:00:00.000Z';

  it('formats elapsed live time in hours, minutes, and seconds', () => {
    expect(
      formatBroadcastDuration(startedAt, Date.parse(startedAt) + 3_754_000),
    ).toBe('1:02:34');
  });

  it('keeps counting beyond a day', () => {
    expect(
      formatBroadcastDuration(startedAt, Date.parse(startedAt) + 90_061_000),
    ).toBe('25:01:01');
  });

  it('does not show negative or unknown time', () => {
    expect(formatBroadcastDuration(startedAt, Date.parse(startedAt) - 1)).toBe(
      '0:00:00',
    );
    expect(formatBroadcastDuration(null, Date.now())).toBe('—');
    expect(formatBroadcastDuration('invalid', Date.now())).toBe('—');
  });
});
