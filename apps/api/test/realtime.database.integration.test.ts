import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  RealtimeErrorEventSchema,
  RoomJoinedEventSchema,
  ServerRealtimeEventSchema,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import {
  accessCookieName,
  csrfCookieName,
} from '../src/auth/auth-token.service.js';
import { csrfHeaderName } from '../src/auth/csrf.guard.js';
import { ScryptPasswordHasher } from '../src/auth/password-hasher.js';
import { createApp } from '../src/create-app.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for realtime database tests');
}

const database = createDatabaseClient(databaseUrl);
const password = 'correct horse battery staple';
const hostId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const viewerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const liveRoomId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const endedRoomId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('room WebSocket gateway', () => {
  let app: NestFastifyApplication;
  let websocketUrl: string;
  let accessCookie: string;

  beforeAll(async () => {
    await removeFixtures();
    const passwordHash = await new ScryptPasswordHasher().hash(password);
    await database.user.createMany({
      data: [
        {
          email: 'realtime-host@example.com',
          id: hostId,
          passwordHash,
          role: 'HOST',
        },
        {
          email: 'realtime-viewer@example.com',
          id: viewerId,
          passwordHash,
          role: 'VIEWER',
        },
      ],
    });
    await database.room.createMany({
      data: [roomRecord(liveRoomId, 'LIVE'), roomRecord(endedRoomId, 'ENDED')],
    });

    app = await createApp({ logger: false });
    await app.listen(0, '127.0.0.1');
    websocketUrl = `${await app.getUrl().then((url) => url.replace('http:', 'ws:'))}/ws`;
    accessCookie = await login();
  });

  afterAll(async () => {
    await app.close();
    await removeFixtures();
    await database.$disconnect();
  });

  it('joins live rooms, blocks guest sends, and broadcasts one message', async () => {
    const sender = await connect(accessCookie);
    const guest = await connect();

    const senderJoined = nextEvent(sender);
    sender.send(JSON.stringify(joinEvent(liveRoomId, 1)));
    expect(RoomJoinedEventSchema.parse(await senderJoined).payload.roomId).toBe(
      liveRoomId,
    );

    const guestJoined = nextEvent(guest);
    guest.send(JSON.stringify(joinEvent(liveRoomId, 2)));
    expect(RoomJoinedEventSchema.parse(await guestJoined).payload.roomId).toBe(
      liveRoomId,
    );

    const guestRejected = nextEvent(guest);
    guest.send(JSON.stringify(sendEvent(liveRoomId, 3, 1, 'Guest message')));
    expect(
      RealtimeErrorEventSchema.parse(await guestRejected).payload.code,
    ).toBe('REALTIME_AUTHENTICATION_REQUIRED');

    const senderCreated = nextEvent(sender);
    const guestCreated = nextEvent(guest);
    sender.send(JSON.stringify(sendEvent(liveRoomId, 4, 2, 'Hello live room')));
    const sent = ServerRealtimeEventSchema.parse(await senderCreated);
    const observed = ServerRealtimeEventSchema.parse(await guestCreated);
    expect(sent).toMatchObject({
      payload: { authorId: viewerId, text: 'Hello live room' },
      type: 'message.created',
    });
    expect(observed).toEqual(sent);

    sender.close();
    guest.close();
  });

  it('rejects ended-room joins and untrusted origins', async () => {
    const viewer = await connect(accessCookie);
    const rejectedJoin = nextEvent(viewer);
    viewer.send(JSON.stringify(joinEvent(endedRoomId, 5)));
    expect(
      RealtimeErrorEventSchema.parse(await rejectedJoin).payload.code,
    ).toBe('REALTIME_ROOM_NOT_LIVE');
    viewer.close();

    await expect(
      connect(undefined, 'https://untrusted.example.com'),
    ).rejects.toThrow('Unexpected server response: 403');
  });

  it('closes an expired authenticated handshake without retry ambiguity', async () => {
    const socket = await connect(`${accessCookieName}=expired-token`);

    await expect(
      new Promise<number>((resolve) => {
        socket.once('close', (code) => resolve(code));
      }),
    ).resolves.toBe(4401);
  });

  async function login(): Promise<string> {
    const csrfResponse = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/auth/csrf',
    });
    const csrfCookie = getSetCookie(csrfResponse.headers, csrfCookieName);
    const csrfToken = cookieValue(csrfCookie);
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: {
          cookie: `${csrfCookieName}=${csrfToken}`,
          [csrfHeaderName]: csrfToken,
          origin: 'http://localhost:3000',
        },
        method: 'POST',
        payload: { email: 'realtime-viewer@example.com', password },
        url: '/api/v1/auth/login',
      });
    expect(response.statusCode).toBe(200);
    return cookiePair(getSetCookie(response.headers, accessCookieName));
  }

  function connect(
    cookie?: string,
    origin = 'http://localhost:3000',
  ): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(websocketUrl, {
        ...(cookie ? { headers: { cookie } } : {}),
        origin,
      });
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });
  }

  async function removeFixtures(): Promise<void> {
    await database.room.deleteMany({
      where: { id: { in: [liveRoomId, endedRoomId] } },
    });
    await database.refreshSession.deleteMany({
      where: { userId: { in: [hostId, viewerId] } },
    });
    await database.user.deleteMany({
      where: { id: { in: [hostId, viewerId] } },
    });
  }
});

function nextEvent(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => {
      try {
        resolve(JSON.parse(data.toString()) as unknown);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Invalid event'));
      }
    });
    socket.once('error', reject);
  });
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
    demoVideoUrl: 'https://video.example.com/demo.mp4',
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

function getSetCookie(
  headers: Record<string, number | string | string[] | undefined>,
  name: string,
): string {
  const header = headers['set-cookie'];
  const cookies = Array.isArray(header)
    ? header
    : typeof header === 'string'
      ? [header]
      : [];
  const cookie = cookies.find((candidate) => candidate.startsWith(`${name}=`));

  if (!cookie) {
    throw new Error(`Expected the ${name} cookie`);
  }

  return cookie;
}

function cookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0] ?? '';
}

function cookieValue(setCookie: string): string {
  return cookiePair(setCookie).split('=', 2)[1] ?? '';
}
