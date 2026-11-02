import { describe, expect, it } from 'vitest';

import { summary } from './benchmark-realtime-summary.mjs';

describe('benchmark latency summary', () => {
  it('reports nearest-rank percentiles and the maximum', () => {
    const values = Array.from({ length: 100 }, (_, index) => 100 - index);
    expect(summary(values)).toEqual({
      count: 100,
      p50: 50,
      p95: 95,
      p99: 99,
      max: 100,
    });
  });

  it('returns nulls for an empty sample', () => {
    expect(summary([])).toEqual({
      count: 0,
      p50: null,
      p95: null,
      p99: null,
      max: null,
    });
  });

  it('handles more samples than the call stack can spread', () => {
    const values = Array.from({ length: 500_000 }, (_, index) => index / 10);
    expect(summary(values)).toMatchObject({
      count: 500_000,
      max: 49_999.9,
    });
  });
});
