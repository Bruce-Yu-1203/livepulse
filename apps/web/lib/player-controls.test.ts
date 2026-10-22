import { describe, expect, it } from 'vitest';

import { clampVolume, effectiveVolume, volumeLevel } from './player-controls';

describe('player controls', () => {
  it('keeps volume between 0 and 1', () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(0.4)).toBe(0.4);
    expect(clampVolume(Number.NaN)).toBe(1);
  });

  it('silences audio while muted or paused', () => {
    expect(effectiveVolume(0.8, false, false)).toBe(0.8);
    expect(effectiveVolume(0.8, true, false)).toBe(0);
    expect(effectiveVolume(0.8, false, true)).toBe(0);
  });

  it('picks the volume icon level', () => {
    expect(volumeLevel(0.8, true)).toBe('muted');
    expect(volumeLevel(0, false)).toBe('muted');
    expect(volumeLevel(0.3, false)).toBe('low');
    expect(volumeLevel(0.9, false)).toBe('high');
  });
});
