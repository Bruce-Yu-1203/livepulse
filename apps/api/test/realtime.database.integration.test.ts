import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  RealtimeErrorEventSchema,
  ListRoomMessagesResponseSchema,
  RoomEndedEventSchema,
  RoomJoinedEventSchema,
  ServerRealtimeEventSchema,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';

import { sessionCookieName } from '../src/auth/better-auth.service.js';
import { createApp } from '../src/create-app.js';
import {
  createCredentialUser,
  sessionCookie,
  signIn,
} from './auth-test-helpers.js';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
const redisKeyPrefix = process.env.REDIS_KEY_PREFIX;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for realtime database tests');
}

if (!redisUrl || !redisKeyPrefix) {
  throw new Error(
    'REDIS_URL and REDIS_KEY_PREFIX are required for realtime database tests',
  );
}

const database = createDatabaseClient(databaseUrl);
const redis = createClient({ url: redisUrl });
const password = 'correct horse battery staple';
const hostId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const viewerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const liveRoomId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const endedRoomId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const endingRoomId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const originalProhibitedWords = process.env.PROHIBITED_WORDS;

describe('room Socket.IO gateway', () => {
  let app: NestFastifyApplication;
  let secondApp: NestFastifyApplication;
  let socketIoUrl: string;
  let secondSocketIoUrl: string;
  let accessCookie: string;
  let hostHeaders: Record<string, string>;

  beforeAll(async () => {
    process.env.PROHIBITED_WORDS = 'scam-offer';
    await redis.connect();
    await removeFixtures();
    await createCredentialUser(database, {
      email: 'realtime-host@example.com',
      id: hostId,
      password,
      role: 'HOST',
    });
    await createCredentialUser(database, {
      email: 'realtime-viewer@example.com',
      id: viewerId,
      password,
      role: 'VIEWER',
    });
    await database.room.createMany({
      data: [
        roomRecord(liveRoomId, 'LIVE'),
        roomRecord(endedRoomId, 'ENDED'),
        roomRecord(endingRoomId, 'LIVE'),
      ],
    });

    app = await createApp({ logger: false });
    secondApp = await createApp({ logger: false });
    await app.listen(0, '127.0.0.1');
    await secondApp.listen(0, '127.0.0.1');
    socketIoUrl = await app.getUrl();
    secondSocketIoUrl = await secondApp.getUrl();
    accessCookie = (await login('realtime-viewer@example.com')).cookie;
    hostHeaders = (await login('realtime-host@example.com')).headers;
  });

  afterAll(async () => {
    await app.close();
    await secondApp.close();
    await removeFixtures();
    await database.$disconnect();
    await redis.close();
    if (originalProhibitedWords === undefined) {
      delete process.env.PROHIBITED_WORDS;
    } else {
      process.env.PROHIBITED_WORDS = originalProhibitedWords;
    }
  });

  it('joins live rooms, blocks guest sends, and broadcasts one message', async () => {
    const sender = await connect(accessCookie);
    const guest = await connect(undefined, 'http://localhost:3000', true);
    expect(sender.io.engine.transport.name).toBe('websocket');
    expect(guest.io.engine.transport.name).toBe('websocket');

    const senderJoined = nextEventOfType(sender, 'room.joined');
    send(sender, joinEvent(liveRoomId, 1));
    expect(
      RoomJoinedEventSchema.parse(await senderJoined).payload,
    ).toMatchObject({
      connections: 1,
      roomId: liveRoomId,
      uniqueUsers: 1,
    });

    const guestJoined = nextEventOfType(guest, 'room.joined');
    send(guest, joinEvent(liveRoomId, 2));
    expect(
      RoomJoinedEventSchema.parse(await guestJoined).payload,
    ).toMatchObject({
      connections: 2,
      roomId: liveRoomId,
      uniqueUsers: 2,
    });

    const secondTab = await connect(accessCookie);
    const secondTabJoined = nextEventOfType(secondTab, 'room.joined');
    send(secondTab, joinEvent(liveRoomId, 3));
    expect(
      RoomJoinedEventSchema.parse(await secondTabJoined).payload,
    ).toMatchObject({
      connections: 3,
      roomId: liveRoomId,
      uniqueUsers: 2,
    });

    const guestRejected = nextEventOfType(guest, 'error');
    send(guest, sendEvent(liveRoomId, 4, 1, 'Guest message'));
    expect(
      RealtimeErrorEventSchema.parse(await guestRejected).payload.code,
    ).toBe('REALTIME_AUTHENTICATION_REQUIRED');

    const senderCreated = nextEventOfType(sender, 'message.created');
    const guestCreated = nextEventOfType(guest, 'message.created');
    send(sender, sendEvent(liveRoomId, 5, 2, 'Hello live room'));
    const sent = ServerRealtimeEventSchema.parse(await senderCreated);
    const observed = ServerRealtimeEventSchema.parse(await guestCreated);
    expect(sent).toMatchObject({
      payload: { authorId: viewerId, text: 'Hello live room' },
      type: 'message.created',
    });
    expect(observed).toEqual(sent);

    const historyResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/rooms/${liveRoomId}/messages`,
      });
    expect(historyResponse.statusCode).toBe(200);
    expect(
      ListRoomMessagesResponseSchema.parse(historyResponse.json()).items,
    ).toMatchObject([{ authorId: viewerId, text: 'Hello live room' }]);

    sender.disconnect();
    guest.disconnect();
    secondTab.disconnect();
  });

  it('rejects ended-room joins and untrusted origins', async () => {
    const viewer = await connect(accessCookie);
    const invalidEvent = nextEventOfType(viewer, 'error');
    viewer.emit('message.send', joinEvent(liveRoomId, 50));
    expect(
      RealtimeErrorEventSchema.parse(await invalidEvent).payload.code,
    ).toBe('REALTIME_INVALID_EVENT');
    const rejectedJoin = nextEventOfType(viewer, 'error');
    send(viewer, joinEvent(endedRoomId, 5));
    expect(
      RealtimeErrorEventSchema.parse(await rejectedJoin).payload.code,
    ).toBe('REALTIME_ROOM_NOT_LIVE');
    viewer.disconnect();

    await expect(
      connect(undefined, 'https://untrusted.example.com'),
    ).rejects.toThrow();
  });

  it('broadcasts across instances and stops delivery after room.leave', async () => {
    const sender = await connect(accessCookie);
    const observer = await connect(undefined, 'http://localhost:3000', true);
    const senderJoined = nextEventOfType(sender, 'room.joined');
    send(sender, joinEvent(liveRoomId, 40));
    await senderJoined;
    const observerJoined = nextEventOfType(observer, 'room.joined');
    send(observer, joinEvent(liveRoomId, 41));
    const joinedCount = RoomJoinedEventSchema.parse(await observerJoined)
      .payload.connections;

    const received = nextEventOfType(observer, 'message.created');
    send(sender, sendEvent(liveRoomId, 42, 42, 'Across instances'));
    expect(ServerRealtimeEventSchema.parse(await received)).toMatchObject({
      payload: { text: 'Across instances' },
      type: 'message.created',
    });

    const remaining = nextEventOfType(sender, 'room.stats');
    observer.emit('room.leave', {
      payload: { roomId: liveRoomId },
      requestId: uuid(43),
      type: 'room.leave',
      v: 1,
    });
    expect(ServerRealtimeEventSchema.parse(await remaining)).toMatchObject({
      payload: { connections: joinedCount - 1, roomId: liveRoomId },
      type: 'room.stats',
    });

    const receivedAfterLeave: unknown[] = [];
    observer.on('message.created', (event: unknown) =>
      receivedAfterLeave.push(event),
    );
    const sentAgain = nextEventOfType(sender, 'message.created');
    send(sender, sendEvent(liveRoomId, 44, 44, 'Only joined peers'));
    await sentAgain;
    expect(receivedAfterLeave).toHaveLength(0);
    sender.disconnect();
    observer.disconnect();
  });

  it('delivers once after a remote client reconnects and rejoins', async () => {
    const sender = await connect(accessCookie);
    const remote = await connect(accessCookie, 'http://localhost:3000', true);
    const unjoined = await connect(accessCookie, 'http://localhost:3000', true);
    const senderJoined = nextEventOfType(sender, 'room.joined');
    send(sender, joinEvent(liveRoomId, 60));
    await senderJoined;
    const remoteJoined = nextEventOfType(remote, 'room.joined');
    send(remote, joinEvent(liveRoomId, 61));
    await remoteJoined;

    const firstDelivery = nextEventOfType(remote, 'message.created');
    send(sender, sendEvent(liveRoomId, 62, 62, 'Before reconnect'));
    await firstDelivery;
    remote.disconnect();

    const replacement = await connect(
      accessCookie,
      'http://localhost:3000',
      true,
    );
    const replacementJoined = nextEventOfType(replacement, 'room.joined');
    send(replacement, joinEvent(liveRoomId, 63));
    await replacementJoined;

    const replacementDeliveries: unknown[] = [];
    const unjoinedDeliveries: unknown[] = [];
    replacement.on('message.created', (event: unknown) =>
      replacementDeliveries.push(event),
    );
    unjoined.on('message.created', (event: unknown) =>
      unjoinedDeliveries.push(event),
    );
    const secondDelivery = nextEventOfType(replacement, 'message.created');
    send(sender, sendEvent(liveRoomId, 64, 64, 'After reconnect'));
    await secondDelivery;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(replacementDeliveries).toHaveLength(1);
    expect(unjoinedDeliveries).toHaveLength(0);
    sender.disconnect();
    replacement.disconnect();
    unjoined.disconnect();
  });

  it('enforces a mute created on one instance against another instance', async () => {
    const viewer = await connect(accessCookie, 'http://localhost:3000', true);
    const joined = nextEventOfType(viewer, 'room.joined');
    send(viewer, joinEvent(liveRoomId, 10));
    await joined;

    const muted = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: hostHeaders,
        method: 'POST',
        payload: { durationMinutes: 10, userId: viewerId },
        url: `/api/v1/rooms/${liveRoomId}/mutes`,
      });
    expect(muted.statusCode).toBe(201);

    const rejected = nextEventOfType(viewer, 'error');
    send(
      viewer,
      sendEvent(liveRoomId, 11, 10, 'This message must not persist'),
    );
    expect(
      RealtimeErrorEventSchema.parse(await rejected).payload,
    ).toMatchObject({
      code: 'REALTIME_MUTED',
      retryAfterMs: expect.any(Number),
    });
    await expect(
      database.danmakuMessage.count({
        where: {
          roomId: liveRoomId,
          text: 'This message must not persist',
        },
      }),
    ).resolves.toBe(0);
    await expect(
      database.auditLog.count({
        where: {
          action: 'ROOM_USER_MUTED',
          actorId: hostId,
          roomId: liveRoomId,
          targetId: viewerId,
        },
      }),
    ).resolves.toBe(1);
    viewer.disconnect();
  });

  it('rejects prohibited content without persisting it', async () => {
    await database.roomMute.deleteMany({
      where: { roomId: liveRoomId, userId: viewerId },
    });
    const sender = await connect(accessCookie);
    const observer = await connect(undefined, 'http://localhost:3000', true);
    const senderJoined = nextEventOfType(sender, 'room.joined');
    send(sender, joinEvent(liveRoomId, 20));
    await senderJoined;
    const observerJoined = nextEventOfType(observer, 'room.joined');
    send(observer, joinEvent(liveRoomId, 21));
    await observerJoined;

    const rejected = nextEventOfType(sender, 'error');
    send(sender, sendEvent(liveRoomId, 22, 20, 'A limited SCAM-OFFER today'));
    expect(RealtimeErrorEventSchema.parse(await rejected).payload.code).toBe(
      'REALTIME_CONTENT_BLOCKED',
    );
    await expect(
      database.danmakuMessage.count({
        where: {
          roomId: liveRoomId,
          text: 'A limited SCAM-OFFER today',
        },
      }),
    ).resolves.toBe(0);

    sender.disconnect();
    observer.disconnect();
  });

  it('propagates a room ending to viewers connected through both instances', async () => {
    const firstViewer = await connect(accessCookie);
    const secondViewer = await connect(
      accessCookie,
      'http://localhost:3000',
      true,
    );
    const firstJoined = nextEventOfType(firstViewer, 'room.joined');
    send(firstViewer, joinEvent(endingRoomId, 30));
    await firstJoined;
    const secondJoined = nextEventOfType(secondViewer, 'room.joined');
    send(secondViewer, joinEvent(endingRoomId, 31));
    await secondJoined;

    const firstEnded = nextEventOfType(firstViewer, 'room.ended');
    const secondEnded = nextEventOfType(secondViewer, 'room.ended');
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: hostHeaders,
        method: 'PATCH',
        payload: { expectedVersion: 1, status: 'ENDED' },
        url: `/api/v1/rooms/${endingRoomId}`,
      });

    expect(response.statusCode).toBe(200);
    const published = RoomEndedEventSchema.parse(await firstEnded);
    expect(published.payload).toMatchObject({ roomId: endingRoomId });
    expect(RoomEndedEventSchema.parse(await secondEnded)).toEqual(published);
    firstViewer.disconnect();
    secondViewer.disconnect();
  });

  it('rejects an expired authenticated handshake without retry ambiguity', async () => {
    await expect(connect(`${sessionCookieName}=expired-token`)).rejects.toThrow(
      'Authentication expired',
    );
  });

  async function login(email: string): Promise<{
    cookie: string;
    headers: Record<string, string>;
  }> {
    const response = await signIn(app, email, password);
    expect(response.statusCode).toBe(200);
    const authenticatedCookie = cookiePair(sessionCookie(response));

    return {
      cookie: authenticatedCookie,
      headers: {
        cookie: authenticatedCookie,
        origin: 'http://localhost:3000',
      },
    };
  }

  function connect(
    cookie?: string,
    origin = 'http://localhost:3000',
    secondInstance = false,
  ): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(secondInstance ? secondSocketIoUrl : socketIoUrl, {
        extraHeaders: { ...(cookie ? { cookie } : {}), origin },
        reconnection: false,
        transports: ['websocket'],
      });
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error) => {
        socket.disconnect();
        reject(error);
      });
    });
  }

  async function removeFixtures(): Promise<void> {
    await redis.del([
      `${redisKeyPrefix}:room:${liveRoomId}:presence`,
      `${redisKeyPrefix}:room:${endedRoomId}:presence`,
      `${redisKeyPrefix}:room:${endingRoomId}:presence`,
      `${redisKeyPrefix}:room:${liveRoomId}:presence-identities`,
      `${redisKeyPrefix}:room:${endedRoomId}:presence-identities`,
      `${redisKeyPrefix}:room:${endingRoomId}:presence-identities`,
    ]);
    await database.danmakuMessage.deleteMany({
      where: { roomId: { in: [liveRoomId, endedRoomId, endingRoomId] } },
    });
    await database.auditLog.deleteMany({
      where: { roomId: { in: [liveRoomId, endedRoomId, endingRoomId] } },
    });
    await database.room.deleteMany({
      where: { id: { in: [liveRoomId, endedRoomId, endingRoomId] } },
    });
    await database.session.deleteMany({
      where: { userId: { in: [hostId, viewerId] } },
    });
    await database.user.deleteMany({
      where: { id: { in: [hostId, viewerId] } },
    });
  }
});

function nextEventOfType(
  socket: Socket,
  type:
    'error' | 'message.created' | 'room.ended' | 'room.joined' | 'room.stats',
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const receive = (data: unknown) => {
      try {
        resolve(ServerRealtimeEventSchema.parse(data));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Invalid event'));
      }
    };
    socket.once(type, receive);
    socket.once('connect_error', reject);
  });
}

function send(socket: Socket, event: { type: string }): void {
  socket.emit(event.type, event);
}

function joinEvent(roomId: string, request: number) {
  return {
    payload: { roomId },
    requestId: uuid(request),
    type: 'room.join',
    v: 1,
  };
}

function sendEvent(
  roomId: string,
  request: number,
  client: number,
  text: string,
) {
  return {
    payload: { clientMessageId: uuid(client), roomId, text },
    requestId: uuid(request),
    type: 'message.send',
    v: 1,
  };
}

function roomRecord(id: string, status: 'ENDED' | 'LIVE') {
  return {
    coverImageUrl: 'https://cdn.example.com/cover.jpg',
    description: 'A realtime integration room.',
    hostId,
    id,
    status,
    title: `${status} room`,
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function cookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0] ?? '';
}
