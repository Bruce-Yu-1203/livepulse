import type { MessageCreatedEvent } from '@livepulse/contracts';
import { describe, expect, it } from 'vitest';

import {
  addPendingMessage,
  markMessageFailed,
  mergeCreatedMessage,
  mergeHistoryMessages,
  reconnectDelay,
  roomPresenceLabel,
  resolveWebSocketUrl,
} from './room-chat';

const clientMessageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const authorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const createdEvent: MessageCreatedEvent = {
  payload: {
    acceptedAt: '2026-10-09T20:00:00.000Z',
    authorId,
    clientMessageId,
    messageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    roomId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    text: 'Hello room',
  },
  requestId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  type: 'message.created',
  v: 1,
};

describe('room chat state', () => {
  it('reconciles an optimistic message with its server broadcast', () => {
    const pending = addPendingMessage([], {
      authorId,
      clientMessageId,
      text: 'Hello room',
    });
    const delivered = mergeCreatedMessage(pending, createdEvent);

    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      id: createdEvent.payload.messageId,
      status: 'sent',
    });
    expect(mergeCreatedMessage(delivered, createdEvent)).toEqual(delivered);
  });

  it('marks a rejected optimistic message as failed', () => {
    const pending = addPendingMessage([], {
      authorId,
      clientMessageId,
      text: 'Hello room',
    });

    expect(markMessageFailed(pending, clientMessageId)[0]?.status).toBe(
      'failed',
    );
  });

  it('prepends older history and reconciles persisted optimistic messages', () => {
    const olderMessage = {
      acceptedAt: '2026-10-09T19:59:00.000Z',
      authorId,
      clientMessageId: '11111111-1111-4111-8111-111111111111',
      messageId: '22222222-2222-4222-8222-222222222222',
      roomId: createdEvent.payload.roomId,
      text: 'Older message',
    };
    const pending = addPendingMessage([], {
      authorId,
      clientMessageId,
      text: 'Hello room',
    });
    const messages = mergeHistoryMessages(pending, [
      olderMessage,
      createdEvent.payload,
    ]);

    expect(messages.map(({ text }) => text)).toEqual([
      'Older message',
      'Hello room',
    ]);
    expect(messages[1]).toMatchObject({
      id: createdEvent.payload.messageId,
      status: 'sent',
    });

    const refreshed = mergeHistoryMessages(messages, [createdEvent.payload]);
    expect(refreshed.map(({ text }) => text)).toEqual([
      'Older message',
      'Hello room',
    ]);
  });

  it('resolves local and deployed websocket URLs with bounded backoff', () => {
    expect(
      resolveWebSocketUrl({
        host: 'localhost:3000',
        hostname: 'localhost',
        port: '3000',
        protocol: 'http:',
      }),
    ).toBe('ws://localhost:3001/ws');
    expect(
      resolveWebSocketUrl({
        host: 'live.example.com',
        hostname: 'live.example.com',
        port: '',
        protocol: 'https:',
      }),
    ).toBe('wss://live.example.com/ws');
    expect(reconnectDelay(0, () => 0.5)).toBe(1_000);
    expect(reconnectDelay(20, () => 0.5)).toBe(30_000);
    expect(roomPresenceLabel(1)).toBe('1 person online');
    expect(roomPresenceLabel(1_250)).toBe('1,250 people online');
  });
});
