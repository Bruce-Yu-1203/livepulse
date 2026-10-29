import { describe, expect, it } from 'vitest';

import { parseKafkaMessage } from './kafka-message-worker.js';

describe('Kafka message records', () => {
  it('accepts only valid room messages', () => {
    const message = {
      acceptedAt: '2026-10-18T20:00:00.000Z',
      authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      clientMessageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      messageId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      text: 'Hello',
    };
    expect(parseKafkaMessage(Buffer.from(JSON.stringify(message)))).toEqual(
      message,
    );
    expect(() => parseKafkaMessage(null)).toThrow('no value');
    expect(() => parseKafkaMessage(Buffer.from('{"text":"bad"}'))).toThrow();
    expect(() =>
      parseKafkaMessage(
        Buffer.from(
          JSON.stringify({ ...message, deletedAt: message.acceptedAt }),
        ),
      ),
    ).toThrow('cannot contain deletedAt');
  });
});
