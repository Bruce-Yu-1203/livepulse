import type { ServerRealtimeEvent } from '@livepulse/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RealtimeRoomSource } from './realtime-room-source.js';
import {
  type RealtimePeer,
  RoomRealtimeHub,
  stableMessageId,
} from './room-realtime-hub.js';

const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('RoomRealtimeHub', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T20:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('joins live rooms and broadcasts one stable message to every member', async () => {
    const hub = new RoomRealtimeHub(roomSource(true), publisher());
    const sender = peer('sender', true);
    const observer = peer('observer', false);
    await hub.handle(sender, joinEvent(1));
    await hub.handle(observer, joinEvent(2));

    await hub.handle(sender, sendEvent(3, 1, 'Hello room'));

    const created = sender.events.at(-1);
    expect(created).toMatchObject({
      payload: {
        authorId: userId,
        clientMessageId: uuid(1),
        roomId,
        text: 'Hello room',
      },
      type: 'message.created',
    });
    expect(observer.events.at(-1)).toEqual(created);
    expect(
      created?.type === 'message.created' && created.payload.messageId,
    ).toBe(stableMessageId(`${userId}:${roomId}:${uuid(1)}`));

    await hub.handle(sender, sendEvent(4, 1, 'Hello room'));
    expect(sender.events).toHaveLength(3);
    expect(observer.events).toHaveLength(2);
  });

  it('allows guests to read but rejects guest sends and ended-room joins', async () => {
    const source = roomSource(true);
    const hub = new RoomRealtimeHub(source, publisher());
    const guest = peer('guest', false);
    await hub.handle(guest, joinEvent(1));
    await hub.handle(guest, sendEvent(2, 1, 'Guest send'));

    expect(guest.events.at(-1)).toMatchObject({
      payload: { code: 'REALTIME_AUTHENTICATION_REQUIRED' },
      type: 'error',
    });

    vi.mocked(source.isLive).mockResolvedValue(false);
    const lateGuest = peer('late-guest', false);
    await hub.handle(lateGuest, joinEvent(3));
    expect(lateGuest.events.at(-1)).toMatchObject({
      payload: { code: 'REALTIME_ROOM_NOT_LIVE' },
      type: 'error',
    });
  });

  it('rejects invalid input, conflicting retries, and burst overflow', async () => {
    const hub = new RoomRealtimeHub(roomSource(true), publisher());
    const sender = peer('sender', true);
    await hub.handle(sender, { unexpected: true });
    expect(sender.events.at(-1)).toMatchObject({
      payload: { code: 'REALTIME_INVALID_EVENT' },
    });

    await hub.handle(sender, joinEvent(1));
    await hub.handle(sender, sendEvent(2, 1, 'Original'));
    await hub.handle(sender, sendEvent(3, 1, 'Changed'));
    expect(sender.events.at(-1)).toMatchObject({
      payload: { code: 'REALTIME_MESSAGE_CONFLICT' },
    });

    for (let index = 2; index <= 6; index += 1) {
      await hub.handle(sender, sendEvent(index + 2, index, `Message ${index}`));
    }

    expect(sender.events.at(-1)).toMatchObject({
      payload: { code: 'REALTIME_RATE_LIMITED', retryAfterMs: 1_000 },
      type: 'error',
    });
  });

  it('returns an explicit unavailable event when room validation fails', async () => {
    const source = roomSource(true);
    vi.mocked(source.isLive).mockRejectedValue(new Error('database offline'));
    const hub = new RoomRealtimeHub(source, publisher());
    const guest = peer('guest', false);

    await hub.handle(guest, joinEvent(1));

    expect(guest.events.at(-1)).toMatchObject({
      payload: { code: 'SERVICE_UNAVAILABLE' },
      type: 'error',
    });
  });

  it('does not broadcast when persistence is unavailable', async () => {
    const failingPublisher = publisher();
    vi.mocked(failingPublisher.publish).mockRejectedValue(
      new Error('MongoDB offline'),
    );
    const hub = new RoomRealtimeHub(roomSource(true), failingPublisher);
    const sender = peer('sender', true);
    const observer = peer('observer', false);
    await hub.handle(sender, joinEvent(1));
    await hub.handle(observer, joinEvent(2));

    await hub.handle(sender, sendEvent(3, 1, 'Not persisted'));

    expect(sender.events.at(-1)).toMatchObject({
      payload: { code: 'SERVICE_UNAVAILABLE' },
      type: 'error',
    });
    expect(observer.events).toHaveLength(1);
  });
});

function roomSource(live: boolean): RealtimeRoomSource {
  return { isLive: vi.fn().mockResolvedValue(live) };
}

function publisher() {
  return {
    publish: vi.fn().mockImplementation((message) =>
      Promise.resolve({
        kind: 'created' as const,
        message,
      }),
    ),
  };
}

function peer(id: string, authenticated: boolean) {
  const events: ServerRealtimeEvent[] = [];
  const realtimePeer: RealtimePeer & { events: ServerRealtimeEvent[] } = {
    events,
    id,
    principal: authenticated
      ? {
          role: 'VIEWER',
          sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          userId,
        }
      : undefined,
    send(event) {
      events.push(event);
    },
  };

  return realtimePeer;
}

function joinEvent(request: number) {
  return {
    payload: { roomId },
    requestId: uuid(request),
    type: 'room.join',
    v: 1,
  };
}

function sendEvent(request: number, client: number, text: string) {
  return {
    payload: { clientMessageId: uuid(client), roomId, text },
    requestId: uuid(request),
    type: 'message.send',
    v: 1,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}
