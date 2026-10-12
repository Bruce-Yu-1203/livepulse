import type {
  DistributedRealtimeEvent,
  ServerRealtimeEvent,
} from '@livepulse/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RealtimeRoomSource } from './realtime-room-source.js';
import type {
  RealtimeEventBus,
  RealtimePresence,
} from './realtime-coordination.js';
import { ProhibitedContentFilter } from './prohibited-content.filter.js';
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
    const hub = createHub();
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
    expect(eventsOfType(sender, 'message.created')).toHaveLength(2);
    expect(eventsOfType(observer, 'message.created')).toHaveLength(1);
  });

  it('publishes leased presence updates when members join and leave', async () => {
    const hub = createHub();
    const first = peer('first', false);
    const second = peer('second', false);

    await hub.handle(first, joinEvent(1));
    await hub.handle(second, joinEvent(2));

    expect(eventsOfType(first, 'room.stats').at(-1)).toMatchObject({
      payload: { connections: 2, roomId, uniqueUsers: 2 },
    });
    await hub.disconnect(second);
    expect(eventsOfType(first, 'room.stats').at(-1)).toMatchObject({
      payload: { connections: 1, roomId, uniqueUsers: 1 },
    });
  });

  it('deduplicates multiple connections from the same authenticated user', async () => {
    const hub = createHub();
    const firstTab = peer('first-tab', true);
    const secondTab = peer('second-tab', true);

    await hub.handle(firstTab, joinEvent(1));
    await hub.handle(secondTab, joinEvent(2));

    expect(eventsOfType(firstTab, 'room.stats').at(-1)).toMatchObject({
      payload: { connections: 2, roomId, uniqueUsers: 1 },
    });
    expect(eventsOfType(secondTab, 'room.joined').at(-1)).toMatchObject({
      payload: { connections: 2, roomId, uniqueUsers: 1 },
    });
  });

  it('refreshes presence leases and statistics every five seconds', async () => {
    const realtimePresence = presence();
    const refresh = vi.spyOn(realtimePresence, 'refresh');
    const hub = new RoomRealtimeHub(
      roomSource(true),
      publisher(),
      eventBus(),
      realtimePresence,
    );
    const viewer = peer('viewer', true);
    await hub.handle(viewer, joinEvent(1));
    hub.onModuleInit();

    await vi.advanceTimersByTimeAsync(4_999);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledOnce();

    hub.onModuleDestroy();
  });

  it('allows guests to read but rejects guest sends and ended-room joins', async () => {
    const source = roomSource(true);
    const hub = createHub(source);
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
    const hub = createHub();
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
    const hub = createHub(source);
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
    const hub = new RoomRealtimeHub(
      roomSource(true),
      failingPublisher,
      eventBus(),
      presence(),
    );
    const sender = peer('sender', true);
    const observer = peer('observer', false);
    await hub.handle(sender, joinEvent(1));
    await hub.handle(observer, joinEvent(2));

    await hub.handle(sender, sendEvent(3, 1, 'Not persisted'));

    expect(sender.events.at(-1)).toMatchObject({
      payload: { code: 'SERVICE_UNAVAILABLE' },
      type: 'error',
    });
    expect(eventsOfType(observer, 'message.created')).toHaveLength(0);
  });

  it('rejects messages from an actively muted user before persistence', async () => {
    const source = roomSource(true);
    vi.mocked(source.findActiveMuteExpiry).mockResolvedValue(
      new Date('2026-10-09T20:10:00.000Z'),
    );
    const messagePublisher = publisher();
    const hub = new RoomRealtimeHub(
      source,
      messagePublisher,
      eventBus(),
      presence(),
    );
    const sender = peer('sender', true);
    await hub.handle(sender, joinEvent(1));

    await hub.handle(sender, sendEvent(2, 1, 'Muted message'));

    expect(sender.events.at(-1)).toMatchObject({
      payload: { code: 'REALTIME_MUTED', retryAfterMs: 600_000 },
      type: 'error',
    });
    expect(messagePublisher.publish).not.toHaveBeenCalled();
  });

  it('rejects prohibited content before persistence and rate limiting', async () => {
    const messagePublisher = publisher();
    const hub = new RoomRealtimeHub(
      roomSource(true),
      messagePublisher,
      eventBus(),
      presence(),
      contentFilter('scam-offer'),
    );
    const sender = peer('sender', true);
    await hub.handle(sender, joinEvent(1));

    for (let index = 1; index <= 6; index += 1) {
      await hub.handle(
        sender,
        sendEvent(index + 1, index, 'Limited SCAM-OFFER today'),
      );
    }

    expect(sender.events.at(-1)).toMatchObject({
      payload: { code: 'REALTIME_CONTENT_BLOCKED' },
      type: 'error',
    });
    expect(messagePublisher.publish).not.toHaveBeenCalled();
  });

  it('fails closed when moderation validation is unavailable', async () => {
    const source = roomSource(true);
    vi.mocked(source.findActiveMuteExpiry).mockRejectedValue(
      new Error('database offline'),
    );
    const messagePublisher = publisher();
    const hub = new RoomRealtimeHub(
      source,
      messagePublisher,
      eventBus(),
      presence(),
    );
    const sender = peer('sender', true);
    await hub.handle(sender, joinEvent(1));

    await hub.handle(sender, sendEvent(2, 1, 'Unchecked message'));

    expect(sender.events.at(-1)).toMatchObject({
      payload: { code: 'SERVICE_UNAVAILABLE' },
      type: 'error',
    });
    expect(messagePublisher.publish).not.toHaveBeenCalled();
  });

  it('falls back to local fan-out when Redis publication fails', async () => {
    const unavailableBus = eventBus();
    vi.mocked(unavailableBus.publish).mockRejectedValue(
      new Error('Redis offline'),
    );
    const hub = new RoomRealtimeHub(
      roomSource(true),
      publisher(),
      unavailableBus,
      presence(),
    );
    const sender = peer('sender', true);
    const observer = peer('observer', false);
    await hub.handle(sender, joinEvent(1));
    await hub.handle(observer, joinEvent(2));

    await hub.handle(sender, sendEvent(3, 1, 'Local fallback'));

    expect(eventsOfType(sender, 'message.created').at(-1)).toMatchObject({
      payload: { text: 'Local fallback' },
    });
    expect(eventsOfType(observer, 'message.created').at(-1)).toMatchObject({
      payload: { text: 'Local fallback' },
    });
  });

  it('purges accepted-message cache entries after a tombstone', async () => {
    const messagePublisher = publisher();
    vi.mocked(messagePublisher.publish)
      .mockResolvedValueOnce({
        kind: 'created',
        message: {
          acceptedAt: '2026-10-09T20:00:00.000Z',
          authorId: userId,
          clientMessageId: uuid(1),
          messageId: stableMessageId(`${userId}:${roomId}:${uuid(1)}`),
          roomId,
          text: 'Removed later',
        },
      })
      .mockResolvedValueOnce({ kind: 'conflict' });
    const bus = eventBus();
    const hub = new RoomRealtimeHub(
      roomSource(true),
      messagePublisher,
      bus,
      presence(),
    );
    const sender = peer('sender', true);
    await hub.handle(sender, joinEvent(1));
    await hub.handle(sender, sendEvent(2, 1, 'Removed later'));

    await bus.publish({
      payload: {
        deletedAt: '2026-10-09T20:01:00.000Z',
        messageId: stableMessageId(`${userId}:${roomId}:${uuid(1)}`),
        roomId,
      },
      requestId: uuid(3),
      type: 'message.deleted',
      v: 1,
    });
    await hub.handle(sender, sendEvent(4, 1, 'Removed later'));

    expect(messagePublisher.publish).toHaveBeenCalledTimes(2);
    expect(sender.events.at(-1)).toMatchObject({
      payload: { code: 'REALTIME_MESSAGE_CONFLICT' },
      type: 'error',
    });
  });
});

function createHub(source = roomSource(true)): RoomRealtimeHub {
  return new RoomRealtimeHub(source, publisher(), eventBus(), presence());
}

function contentFilter(terms: string): ProhibitedContentFilter {
  const previous = process.env.PROHIBITED_WORDS;
  process.env.PROHIBITED_WORDS = terms;
  const filter = new ProhibitedContentFilter();
  if (previous === undefined) {
    delete process.env.PROHIBITED_WORDS;
  } else {
    process.env.PROHIBITED_WORDS = previous;
  }
  return filter;
}

function roomSource(live: boolean): RealtimeRoomSource {
  return {
    findActiveMuteExpiry: vi.fn().mockResolvedValue(null),
    isLive: vi.fn().mockResolvedValue(live),
  };
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

function eventBus(): RealtimeEventBus {
  const listeners = new Set<(event: DistributedRealtimeEvent) => void>();
  return {
    publish: vi.fn().mockImplementation((event: DistributedRealtimeEvent) => {
      for (const listener of listeners) {
        listener(event);
      }
      return Promise.resolve();
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function presence(): RealtimePresence {
  const roomMembers = new Map<string, Map<string, string>>();
  return {
    async join(joinedRoomId, connectionId, identityId) {
      const members =
        roomMembers.get(joinedRoomId) ?? new Map<string, string>();
      members.set(connectionId, identityId);
      roomMembers.set(joinedRoomId, members);
      return presenceCounts(members);
    },
    async leave(leftRoomId, connectionId) {
      const members = roomMembers.get(leftRoomId) ?? new Map<string, string>();
      members.delete(connectionId);
      return presenceCounts(members);
    },
    async refresh(connections) {
      return new Map(
        [...new Set(connections.map(({ roomId: id }) => id))].map((id) => [
          id,
          presenceCounts(roomMembers.get(id) ?? new Map<string, string>()),
        ]),
      );
    },
  };
}

function presenceCounts(members: ReadonlyMap<string, string>) {
  return {
    connections: members.size,
    uniqueUsers: new Set(members.values()).size,
  };
}

function eventsOfType<T extends ServerRealtimeEvent['type']>(
  target: ReturnType<typeof peer>,
  type: T,
): Extract<ServerRealtimeEvent, { type: T }>[] {
  return target.events.filter(
    (event): event is Extract<ServerRealtimeEvent, { type: T }> =>
      event.type === type,
  );
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
