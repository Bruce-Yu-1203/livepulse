import { describe, expect, it } from 'vitest';

import { classifyCreatedEvent } from './benchmark-realtime-ack.mjs';

describe('benchmark message.created classification', () => {
  const sentRequestIds = new Set(['sent-request']);

  it('uses the broadcast event as ACK and delivery in direct mode', () => {
    expect(
      classifyCreatedEvent({
        separateAck: false,
        sentRequestIds,
        event: { requestId: 'sent-request' },
      }),
    ).toBe('ack-and-delivery');
  });

  it('separates the Kafka admission ACK from the broadcast delivery', () => {
    expect(
      classifyCreatedEvent({
        separateAck: true,
        sentRequestIds,
        event: { requestId: 'sent-request' },
      }),
    ).toBe('ack');
    expect(
      classifyCreatedEvent({
        separateAck: true,
        sentRequestIds,
        event: { requestId: 'worker-request' },
      }),
    ).toBe('delivery');
  });
});
