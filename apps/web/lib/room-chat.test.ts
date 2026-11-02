import type {
  MessageBatchEvent,
  MessageCreatedEvent,
} from '@livepulse/contracts';
import { describe, expect, it } from 'vitest';

import {
  addPendingMessage,
  createdEventsOf,
  markMessageDeleted,
  markMessageFailed,
  mergeCreatedMessage,
  mergeCreatedMessages,
  mergeHistoryMessages,
  messageAcknowledgementTimeoutMs,
  maxMessageDeliveryAttempts,
  PendingMessageTracker,
  pendingMessageRetentionMs,
  rejectChatMessage,
  realtimeErrorMessage,
  roomChatIsClosed,
  roomPresenceLabel,
  resolveSocketIoOrigin,
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
  it('replaces deleted text with a stable tombstone', () => {
    const deletedAt = '2026-10-11T01:00:00.000Z';
    const delivered = mergeCreatedMessage([], createdEvent);

    expect(
      markMessageDeleted(
        delivered,
        createdEvent.payload.messageId,
        deletedAt,
      )[0],
    ).toMatchObject({
      deletedAt,
      id: createdEvent.payload.messageId,
      status: 'sent',
      text: 'Message removed by moderation',
    });
  });

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

  it('applies every message in a coalesced batch in order', () => {
    const second: MessageCreatedEvent = {
      ...createdEvent,
      payload: {
        ...createdEvent.payload,
        clientMessageId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        messageId: '99999999-9999-4999-8999-999999999999',
        text: 'Second message',
      },
    };
    const batch: MessageBatchEvent = {
      payload: {
        messages: [createdEvent, second],
        roomId: createdEvent.payload.roomId,
      },
      requestId: createdEvent.requestId,
      type: 'message.batch',
      v: 1,
    };
    const pending = addPendingMessage([], {
      authorId,
      clientMessageId,
      text: 'Hello room',
    });

    expect(createdEventsOf(createdEvent)).toEqual([createdEvent]);
    expect(createdEventsOf(batch)).toEqual([createdEvent, second]);
    const delivered = mergeCreatedMessages(pending, createdEventsOf(batch));
    expect(delivered.map((message) => [message.text, message.status])).toEqual([
      ['Hello room', 'sent'],
      ['Second message', 'sent'],
    ]);
    expect(mergeCreatedMessages(delivered, [second])).toEqual(delivered);
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

  it('removes a rate-limited optimistic message and keeps the retry prompt', () => {
    const pending = addPendingMessage([], {
      authorId,
      clientMessageId,
      text: 'Too fast',
    });

    expect(
      rejectChatMessage(pending, clientMessageId, 'REALTIME_RATE_LIMITED'),
    ).toEqual([]);
    expect(
      realtimeErrorMessage({
        code: 'REALTIME_RATE_LIMITED',
        message: 'Wait before sending another message',
        retryAfterMs: 1_200,
      }),
    ).toBe("You're sending messages too quickly. Try again in 2 seconds.");
    expect(
      rejectChatMessage(pending, clientMessageId, 'REALTIME_CONTENT_BLOCKED')[0]
        ?.status,
    ).toBe('failed');
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

  it('never restores original text over a history tombstone', () => {
    const delivered = mergeCreatedMessage([], createdEvent);
    const deletedAt = '2026-10-11T01:00:00.000Z';
    const reconciled = mergeHistoryMessages(delivered, [
      {
        ...createdEvent.payload,
        deletedAt,
        text: 'Message removed by moderation',
      },
    ]);

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({
      deletedAt,
      text: 'Message removed by moderation',
    });
    expect(mergeCreatedMessage(reconciled, createdEvent)).toEqual(reconciled);
  });

  it('resolves local and deployed Socket.IO origins', () => {
    expect(
      resolveSocketIoOrigin({
        host: 'localhost:3000',
        hostname: 'localhost',
        port: '3000',
        protocol: 'http:',
      }),
    ).toBe('http://localhost:3001');
    expect(
      resolveSocketIoOrigin({
        host: 'live.example.com',
        hostname: 'live.example.com',
        port: '',
        protocol: 'https:',
      }),
    ).toBe('https://live.example.com');
    expect(
      resolveSocketIoOrigin(
        {
          host: 'localhost:3000',
          hostname: 'localhost',
          port: '3000',
          protocol: 'http:',
        },
        'https://api.example.com',
      ),
    ).toBe('https://api.example.com');
    expect(roomPresenceLabel(1, 1)).toBe('1 person online');
    expect(roomPresenceLabel(1_250, 1_250)).toBe('1,250 people online');
    expect(roomPresenceLabel(1, 2)).toBe('1 person online · 2 connections');
  });

  it('closes the composer when the room or realtime session has ended', () => {
    expect(roomChatIsClosed('LIVE', 'connected')).toBe(false);
    expect(roomChatIsClosed('LIVE', 'ended')).toBe(true);
    expect(roomChatIsClosed('ENDED', 'connected')).toBe(true);
  });

  it('shows a clear message when the server blocks prohibited content', () => {
    expect(
      realtimeErrorMessage({
        code: 'REALTIME_CONTENT_BLOCKED',
        message: 'Server fallback',
      }),
    ).toBe('Your message was blocked by the room content policy.');
    expect(
      realtimeErrorMessage({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Try again later',
      }),
    ).toBe('Try again later');
    expect(
      realtimeErrorMessage({
        code: 'REALTIME_RATE_LIMITED',
        message: 'Server fallback',
        retryAfterMs: 1_200,
      }),
    ).toBe("You're sending messages too quickly. Try again in 2 seconds.");
  });
});

describe('pending message delivery', () => {
  it('retries with the same client message and stops after acknowledgement', () => {
    const tracker = new PendingMessageTracker();
    tracker.add(clientMessageId, 'Hello room', 1_000);
    const firstAttempt = tracker.beginAttempt(
      clientMessageId,
      'request-1',
      1_000,
    );

    expect(firstAttempt).toMatchObject({
      attempts: 1,
      clientMessageId,
      text: 'Hello room',
    });
    expect(
      tracker.sweep(1_000 + messageAcknowledgementTimeoutMs - 1).retryable,
    ).toEqual([]);
    expect(
      tracker.sweep(1_000 + messageAcknowledgementTimeoutMs).retryable,
    ).toMatchObject([{ attempts: 1, clientMessageId }]);

    tracker.beginAttempt(
      clientMessageId,
      'request-2',
      1_000 + messageAcknowledgementTimeoutMs,
    );
    expect(tracker.acknowledge(clientMessageId)).toBe(true);
    expect(tracker.sweep(999_999)).toEqual({
      failedClientMessageIds: [],
      retryable: [],
    });
  });

  it('marks a delivery failed only after bounded retries time out', () => {
    const tracker = new PendingMessageTracker();
    tracker.add(clientMessageId, 'Hello room', 0);

    for (let attempt = 0; attempt < maxMessageDeliveryAttempts; attempt += 1) {
      tracker.beginAttempt(
        clientMessageId,
        `request-${attempt}`,
        attempt * messageAcknowledgementTimeoutMs,
      );
    }

    expect(
      tracker.sweep(
        maxMessageDeliveryAttempts * messageAcknowledgementTimeoutMs - 1,
      ).failedClientMessageIds,
    ).toEqual([]);
    expect(
      tracker.sweep(
        maxMessageDeliveryAttempts * messageAcknowledgementTimeoutMs,
      ).failedClientMessageIds,
    ).toEqual([clientMessageId]);
  });

  it('expires unresolved messages after five minutes and maps rejections', () => {
    const tracker = new PendingMessageTracker();
    tracker.add(clientMessageId, 'Hello room', 5_000);
    tracker.beginAttempt(clientMessageId, 'request-1', 5_000);

    expect(tracker.rejectRequest('unknown-request')).toBeUndefined();
    expect(
      tracker.sweep(5_000 + pendingMessageRetentionMs).failedClientMessageIds,
    ).toEqual([clientMessageId]);

    tracker.add(clientMessageId, 'Hello again', 10_000);
    tracker.beginAttempt(clientMessageId, 'request-2', 10_000);
    expect(tracker.rejectRequest('request-2')).toBe(clientMessageId);
    expect(tracker.sweep(999_999).retryable).toEqual([]);
  });

  it('fails every unresolved delivery when a live room ends', () => {
    const tracker = new PendingMessageTracker();
    const secondClientMessageId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    tracker.add(clientMessageId, 'First message');
    tracker.add(secondClientMessageId, 'Second message');

    expect(tracker.failAll()).toEqual([clientMessageId, secondClientMessageId]);
    expect(tracker.sweep()).toEqual({
      failedClientMessageIds: [],
      retryable: [],
    });
  });
});
