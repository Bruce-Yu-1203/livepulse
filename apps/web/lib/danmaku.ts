import type { MessageCreatedEvent } from '@livepulse/contracts';

export const danmakuDensities = ['low', 'medium', 'high'] as const;

export type DanmakuDensity = (typeof danmakuDensities)[number];

export interface DanmakuMessage {
  id: string;
  laneIndex: number;
  receivedAt: number;
  roomId: string;
  text: string;
}

export const danmakuDurationMs = 9_000;

const layouts: Record<DanmakuDensity, { lanes: number; limit: number }> = {
  high: { lanes: 8, limit: 14 },
  low: { lanes: 4, limit: 4 },
  medium: { lanes: 6, limit: 8 },
};
const maxDanmakuMessages = layouts.high.limit;

export function danmakuLayout(density: DanmakuDensity): {
  lanes: number;
  limit: number;
} {
  return layouts[density];
}

export function expireDanmakuMessages(
  messages: DanmakuMessage[],
  now: number,
): DanmakuMessage[] {
  if (
    messages.every((message) => now - message.receivedAt < danmakuDurationMs)
  ) {
    return messages;
  }

  return messages.filter(
    (message) => now - message.receivedAt < danmakuDurationMs,
  );
}

export function appendRealtimeDanmaku(
  messages: DanmakuMessage[],
  payload: MessageCreatedEvent['payload'],
  now: number,
): DanmakuMessage[] {
  const active = expireDanmakuMessages(messages, now);
  if (active.some((message) => message.id === payload.messageId)) {
    return active;
  }

  return [
    ...active,
    {
      id: payload.messageId,
      laneIndex: (active.at(-1)?.laneIndex ?? -1) + 1,
      receivedAt: now,
      roomId: payload.roomId,
      text: payload.text,
    },
  ].slice(-maxDanmakuMessages);
}
