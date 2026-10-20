import { describe, expect, it } from 'vitest';

import { BroadcastConnectionResponseSchema } from './broadcast.js';

describe('BroadcastConnectionResponseSchema', () => {
  it('accepts a LiveKit connection response', () => {
    const response = {
      participantToken: 'signed-token',
      requestId: 'request-1',
      serverUrl: 'wss://livepulse.example.livekit.cloud',
    };

    expect(BroadcastConnectionResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects incomplete credentials', () => {
    expect(
      BroadcastConnectionResponseSchema.safeParse({
        requestId: 'request-1',
        serverUrl: 'wss://livepulse.example.livekit.cloud',
      }).success,
    ).toBe(false);
  });
});
