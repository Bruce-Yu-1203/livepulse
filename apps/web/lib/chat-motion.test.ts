import { describe, expect, it } from 'vitest';

import {
  chatBurstThreshold,
  chatBurstWindowMs,
  isChatBurst,
  recentArrivals,
} from './chat-motion';

describe('chat motion', () => {
  it('drops arrivals older than the burst window', () => {
    expect(recentArrivals([0, 500, 2_500], 3_000)).toEqual([2_500]);
  });

  it('stays calm at a readable pace', () => {
    const arrivals = Array.from(
      { length: chatBurstThreshold },
      (_, index) => index * 300,
    );
    expect(isChatBurst(arrivals, 1_800)).toBe(false);
  });

  it('detects a burst when messages outrun the threshold', () => {
    const arrivals = Array.from(
      { length: chatBurstThreshold + 1 },
      (_, index) => index * 100,
    );
    expect(isChatBurst(arrivals, 700)).toBe(true);
    expect(isChatBurst(arrivals, 700 + chatBurstWindowMs)).toBe(false);
  });
});
