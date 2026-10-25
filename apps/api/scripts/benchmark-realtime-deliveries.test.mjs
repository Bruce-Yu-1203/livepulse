import { describe, expect, it } from 'vitest';

import { createDeliveryVerifier } from './benchmark-realtime-deliveries.mjs';

describe('benchmark delivery verification', () => {
  it('counts each recipient for the sender room and excludes warm-up events', async () => {
    const verifier = createDeliveryVerifier(['a', 'a', 'b'], 3);
    verifier.record(0, { payload: { text: 'Local benchmark warm-up' } });
    for (const [socketIndex, messageIndex] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 2],
    ]) {
      verifier.record(socketIndex, {
        payload: { text: `Local benchmark message ${messageIndex}` },
      });
    }
    expect(await verifier.finish()).toEqual({
      expected: 5,
      received: 5,
      uniqueReceived: 5,
      missing: 0,
      duplicates: 0,
      wrongRoomDeliveries: 0,
      invalidMessageIndexes: 0,
      complete: true,
      minPerSocket: 1,
      maxPerSocket: 2,
      minUniquePerSocket: 1,
      maxUniquePerSocket: 2,
    });
  });

  it('reports incomplete fanout after the drain timeout', async () => {
    const verifier = createDeliveryVerifier(['a', 'a'], 1);
    verifier.record(0, { payload: { text: 'Local benchmark message 0' } });
    expect(await verifier.finish(1)).toMatchObject({
      expected: 2,
      received: 1,
      missing: 1,
      complete: false,
    });
  });

  it('detects a duplicate that balances a missing recipient', async () => {
    const verifier = createDeliveryVerifier(['a', 'a'], 1);
    for (let index = 0; index < 2; index += 1) {
      verifier.record(0, { payload: { text: 'Local benchmark message 0' } });
    }
    expect(await verifier.finish(1)).toMatchObject({
      expected: 2,
      received: 2,
      uniqueReceived: 1,
      missing: 1,
      duplicates: 1,
      complete: false,
    });
  });

  it('detects delivery to a socket in the wrong room', async () => {
    const verifier = createDeliveryVerifier(['a', 'b'], 2);
    verifier.record(1, { payload: { text: 'Local benchmark message 0' } });
    expect(await verifier.finish(1)).toMatchObject({
      wrongRoomDeliveries: 1,
      complete: false,
    });
  });
});
