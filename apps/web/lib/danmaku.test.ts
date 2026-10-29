import { describe, expect, it } from 'vitest';

import {
  appendRealtimeDanmaku,
  danmakuDensities,
  danmakuDurationMs,
  danmakuLayout,
  expireDanmakuMessages,
} from './danmaku';

describe('danmaku display preferences', () => {
  it('offers bounded low, medium, and high density layouts', () => {
    expect(danmakuDensities).toEqual(['low', 'medium', 'high']);
    expect(danmakuLayout('low')).toEqual({ lanes: 4, limit: 4 });
    expect(danmakuLayout('medium')).toEqual({ lanes: 6, limit: 8 });
    expect(danmakuLayout('high')).toEqual({ lanes: 8, limit: 14 });
  });

  it('increases both visible messages and lanes with density', () => {
    const low = danmakuLayout('low');
    const medium = danmakuLayout('medium');
    const high = danmakuLayout('high');

    expect(low.limit).toBeLessThan(medium.limit);
    expect(medium.limit).toBeLessThan(high.limit);
    expect(low.lanes).toBeLessThan(high.lanes);
  });
});

describe('realtime danmaku', () => {
  const message = {
    acceptedAt: '2026-10-29T12:00:00.000Z',
    authorId: 'author',
    clientMessageId: 'client-message',
    messageId: 'message-1',
    roomId: 'room-1',
    text: 'Live message',
  };

  it('shows a delivered message once and removes it after the animation', () => {
    const received = appendRealtimeDanmaku([], message, 1_000);

    expect(received).toEqual([
      {
        id: 'message-1',
        laneIndex: 0,
        receivedAt: 1_000,
        roomId: 'room-1',
        text: 'Live message',
      },
    ]);
    expect(appendRealtimeDanmaku(received, message, 2_000)).toBe(received);
    expect(expireDanmakuMessages(received, 1_000 + danmakuDurationMs - 1)).toBe(
      received,
    );
    expect(expireDanmakuMessages(received, 1_000 + danmakuDurationMs)).toEqual(
      [],
    );
  });

  it('keeps a bounded queue of the newest live deliveries', () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      ...message,
      messageId: `message-${index}`,
    })).reduce(
      (current, payload, index) =>
        appendRealtimeDanmaku(current, payload, 1_000 + index),
      [] as ReturnType<typeof appendRealtimeDanmaku>,
    );

    expect(messages).toHaveLength(danmakuLayout('high').limit);
    expect(messages[0]?.id).toBe('message-6');
    expect(messages[0]?.laneIndex).toBe(6);
    expect(messages.at(-1)?.id).toBe('message-19');
  });
});
