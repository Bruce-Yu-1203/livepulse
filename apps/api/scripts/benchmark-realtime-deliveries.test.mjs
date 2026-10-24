import { describe, expect, it } from 'vitest';

import { createDeliveryVerifier } from './benchmark-realtime-deliveries.mjs';

describe('benchmark delivery verification', () => {
  it('counts each recipient for the sender room and excludes warm-up events', async () => {
    const verifier = createDeliveryVerifier(['a', 'a', 'b'], 3);
    verifier.record(0, { payload: { text: 'Local benchmark warm-up' } });
    for (const socketIndex of [0, 1, 0, 1, 2]) {
      verifier.record(socketIndex, {
        payload: { text: 'Local benchmark message 1' },
      });
    }
    expect(await verifier.finish()).toEqual({
      expected: 5,
      received: 5,
      complete: true,
      minPerSocket: 1,
      maxPerSocket: 2,
    });
  });

  it('reports incomplete fanout after the drain timeout', async () => {
    const verifier = createDeliveryVerifier(['a', 'a'], 1);
    verifier.record(0, { payload: { text: 'Local benchmark message 0' } });
    expect(await verifier.finish(1)).toMatchObject({
      expected: 2,
      received: 1,
      complete: false,
    });
  });
});
