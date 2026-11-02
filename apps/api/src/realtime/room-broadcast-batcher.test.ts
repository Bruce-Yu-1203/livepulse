import type { MessageCreatedEvent } from '@livepulse/contracts';
import { maxMessageBatchSize } from '@livepulse/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readBroadcastBatchWindowMs,
  RoomBroadcastBatcher,
  type RoomBroadcastFrame,
} from './room-broadcast-batcher.js';

const roomA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const roomB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function created(roomId: string, index: number): MessageCreatedEvent {
  const suffix = index.toString(16).padStart(12, '0');
  return {
    payload: {
      acceptedAt: '2026-11-02T00:00:00.000Z',
      authorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      clientMessageId: `dddddddd-dddd-4ddd-8ddd-${suffix}`,
      messageId: `eeeeeeee-eeee-4eee-8eee-${suffix}`,
      roomId,
      text: `Message ${index}`,
    },
    requestId: `ffffffff-ffff-4fff-8fff-${suffix}`,
    type: 'message.created',
    v: 1,
  };
}

function recorder(windowMs: number) {
  const frames: Array<{ roomId: string; frame: RoomBroadcastFrame }> = [];
  const batcher = new RoomBroadcastBatcher(
    (roomId, frame) => frames.push({ roomId, frame }),
    windowMs,
  );
  return { batcher, frames };
}

function messageTexts(frame: RoomBroadcastFrame): string[] {
  return frame.type === 'message.batch'
    ? frame.payload.messages.map((message) => message.payload.text)
    : [frame.payload.text];
}

describe('readBroadcastBatchWindowMs', () => {
  it('disables batching when the variable is unset or empty', () => {
    expect(readBroadcastBatchWindowMs(undefined)).toBe(0);
    expect(readBroadcastBatchWindowMs('  ')).toBe(0);
    expect(readBroadcastBatchWindowMs('0')).toBe(0);
  });

  it('accepts whole milliseconds up to one second', () => {
    expect(readBroadcastBatchWindowMs('50')).toBe(50);
    expect(readBroadcastBatchWindowMs('1000')).toBe(1_000);
  });

  it('rejects negative, fractional, oversized, and non-numeric values', () => {
    for (const value of ['-1', '12.5', '1001', 'fast']) {
      expect(() => readBroadcastBatchWindowMs(value)).toThrow(
        'REALTIME_BROADCAST_BATCH_MS',
      );
    }
  });
});

describe('RoomBroadcastBatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits every message immediately when batching is disabled', () => {
    const { batcher, frames } = recorder(0);

    batcher.add(created(roomA, 1));
    batcher.add(created(roomA, 2));

    expect(batcher.enabled).toBe(false);
    expect(frames.map(({ frame }) => frame.type)).toEqual([
      'message.created',
      'message.created',
    ]);
  });

  it('sends the first message of a quiet room without waiting', () => {
    const { batcher, frames } = recorder(50);

    batcher.add(created(roomA, 1));

    expect(frames).toHaveLength(1);
    expect(frames[0]?.frame.type).toBe('message.created');
  });

  it('coalesces messages that arrive inside the window into one ordered frame', () => {
    const { batcher, frames } = recorder(50);

    batcher.add(created(roomA, 1));
    batcher.add(created(roomA, 2));
    batcher.add(created(roomA, 3));
    expect(frames).toHaveLength(1);

    vi.advanceTimersByTime(50);

    expect(frames).toHaveLength(2);
    const batch = frames[1]?.frame;
    expect(batch?.type).toBe('message.batch');
    expect(frames[1]?.roomId).toBe(roomA);
    expect(messageTexts(batch!)).toEqual(['Message 2', 'Message 3']);
  });

  it('keeps writing at most one frame per window while a room stays busy', () => {
    const { batcher, frames } = recorder(50);

    for (let index = 0; index < 100; index += 1) {
      batcher.add(created(roomA, index));
      vi.advanceTimersByTime(5);
    }
    vi.advanceTimersByTime(100);

    // 500 ms of traffic with a 50 ms window: one leading frame, then one per window.
    expect(frames.length).toBeLessThanOrEqual(11);
    expect(frames.flatMap(({ frame }) => messageTexts(frame))).toEqual(
      Array.from({ length: 100 }, (_, index) => `Message ${index}`),
    );
  });

  it('closes an idle window so the next message is immediate again', () => {
    const { batcher, frames } = recorder(50);

    batcher.add(created(roomA, 1));
    vi.advanceTimersByTime(50);
    expect(batcher.pendingCount(roomA)).toBe(0);

    batcher.add(created(roomA, 2));

    expect(frames).toHaveLength(2);
    expect(frames[1]?.frame.type).toBe('message.created');
  });

  it('emits a lone held message as a plain message.created event', () => {
    const { batcher, frames } = recorder(50);

    batcher.add(created(roomA, 1));
    batcher.add(created(roomA, 2));
    vi.advanceTimersByTime(50);

    expect(frames[1]?.frame.type).toBe('message.created');
    expect(messageTexts(frames[1]!.frame)).toEqual(['Message 2']);
  });

  it('keeps rooms independent', () => {
    const { batcher, frames } = recorder(50);

    batcher.add(created(roomA, 1));
    batcher.add(created(roomB, 2));
    batcher.add(created(roomA, 3));
    batcher.add(created(roomB, 4));
    vi.advanceTimersByTime(50);

    expect(frames.map(({ roomId }) => roomId)).toEqual([
      roomA,
      roomB,
      roomA,
      roomB,
    ]);
    expect(messageTexts(frames[2]!.frame)).toEqual(['Message 3']);
    expect(messageTexts(frames[3]!.frame)).toEqual(['Message 4']);
  });

  it('flushes held messages on demand without closing the window', () => {
    const { batcher, frames } = recorder(50);

    batcher.add(created(roomA, 1));
    batcher.add(created(roomA, 2));
    batcher.flush(roomA);
    batcher.flush(roomB);

    expect(frames).toHaveLength(2);
    batcher.add(created(roomA, 3));
    expect(frames).toHaveLength(2);
    vi.advanceTimersByTime(50);
    expect(messageTexts(frames[2]!.frame)).toEqual(['Message 3']);
  });

  it('emits early when a batch reaches the contract size limit', () => {
    const { batcher, frames } = recorder(50);

    batcher.add(created(roomA, 0));
    for (let index = 1; index <= maxMessageBatchSize; index += 1) {
      batcher.add(created(roomA, index));
    }

    expect(frames).toHaveLength(2);
    const batch = frames[1]!.frame;
    expect(batch.type).toBe('message.batch');
    expect(messageTexts(batch)).toHaveLength(maxMessageBatchSize);
  });

  it('emits everything held and stops its timers on close', () => {
    const { batcher, frames } = recorder(50);

    batcher.add(created(roomA, 1));
    batcher.add(created(roomA, 2));
    batcher.add(created(roomB, 3));
    batcher.add(created(roomB, 4));
    batcher.close();

    expect(frames.flatMap(({ frame }) => messageTexts(frame))).toEqual([
      'Message 1',
      'Message 3',
      'Message 2',
      'Message 4',
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
