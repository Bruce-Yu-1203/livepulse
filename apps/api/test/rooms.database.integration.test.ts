import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  CreateRoomResponseSchema,
  CurrentBroadcastResponseSchema,
  GetRoomResponseSchema,
  GetPublicUserResponseSchema,
  ListOwnedRoomsResponseSchema,
  ListBroadcastHistoryResponseSchema,
  ListRoomsResponseSchema,
  MuteRoomUserResponseSchema,
  RoomLikeResponseSchema,
  SearchSuggestionsResponseSchema,
  UpdateRoomResponseSchema,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/create-app.js';
import {
  createCredentialUser,
  sessionCookie,
  signIn,
} from './auth-test-helpers.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for room database tests');
}

const database = createDatabaseClient(databaseUrl);
const password = 'correct horse battery staple';
const roomInput = {
  coverImageUrl: 'https://cdn.example.com/live/cover.jpg',
  description: 'A room for learning distributed systems.',
  title: 'LivePulse Architecture Lab',
};

describe('POST /api/v1/rooms', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    await database.auditLog.deleteMany();
    await database.room.deleteMany();
    await database.session.deleteMany();
    await database.user.deleteMany();
    await createCredentialUser(database, {
      email: 'host@example.com',
      password,
      role: 'HOST',
    });
    await createCredentialUser(database, {
      email: 'viewer@example.com',
      password,
      role: 'VIEWER',
    });
  });

  afterAll(async () => {
    await app.close();
    await database.$disconnect();
  });

  it('lets a host create a database-owned draft room', async () => {
    const headers = await authenticatedHeaders('host@example.com');
    const response = await createRoom(headers, roomInput);

    expect(response.statusCode).toBe(201);
    const body = CreateRoomResponseSchema.parse(response.json());
    expect(response.headers['x-request-id']).toBe(body.requestId);
    expect(body.room.status).toBe('DRAFT');
    expect(body.room.title).toBe(roomInput.title);
    expect(body.room.likeCount).toBe(0);
    expect(body.room.version).toBe(1);

    const storedRoom = await database.room.findUniqueOrThrow({
      where: { id: body.room.id },
    });
    expect(storedRoom.hostId).toBe(body.room.hostId);
    expect(storedRoom.status).toBe('DRAFT');
    expect(storedRoom.coverImageUrl).toBe(roomInput.coverImageUrl);
  });

  it('rejects an authenticated viewer without creating a room', async () => {
    const headers = await authenticatedHeaders('viewer@example.com');
    const response = await createRoom(headers, roomInput);

    expect(response.statusCode).toBe(403);
    expect(ApiErrorResponseSchema.parse(response.json()).code).toBe(
      ApiErrorCode.Forbidden,
    );
    await expect(database.room.count()).resolves.toBe(0);
  });

  it('rejects an anonymous request before authorization', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'POST',
      payload: roomInput,
      url: '/api/v1/rooms',
    });

    expect(response.statusCode).toBe(401);
    expect(ApiErrorResponseSchema.parse(response.json()).code).toBe(
      ApiErrorCode.Unauthorized,
    );
    await expect(database.room.count()).resolves.toBe(0);
  });

  it('rejects invalid input and client-controlled room state', async () => {
    const headers = await authenticatedHeaders('host@example.com');
    const response = await createRoom(headers, {
      ...roomInput,
      status: 'LIVE',
      title: '',
    });

    expect(response.statusCode).toBe(400);
    expect(ApiErrorResponseSchema.parse(response.json()).code).toBe(
      ApiErrorCode.ValidationError,
    );
    await expect(database.room.count()).resolves.toBe(0);
  });

  it('lets a host manage a draft through its legal lifecycle', async () => {
    const headers = await authenticatedHeaders('host@example.com');
    const createdResponse = await createRoom(headers, roomInput);
    const created = CreateRoomResponseSchema.parse(createdResponse.json()).room;

    const ownedResponse = await app.getHttpAdapter().getInstance().inject({
      headers,
      method: 'GET',
      url: '/api/v1/rooms/mine',
    });
    expect(ownedResponse.statusCode).toBe(200);
    const owned = ListOwnedRoomsResponseSchema.parse(ownedResponse.json());
    expect(owned.items.map(({ id }) => id)).toContain(created.id);

    const editedResponse = await updateRoom(headers, created.id, {
      expectedVersion: created.version,
      title: 'Updated Architecture Lab',
    });
    expect(editedResponse.statusCode).toBe(200);
    const edited = UpdateRoomResponseSchema.parse(editedResponse.json()).room;
    expect(edited).toMatchObject({
      status: 'DRAFT',
      title: 'Updated Architecture Lab',
      version: 2,
    });

    const staleResponse = await updateRoom(headers, created.id, {
      description: 'This stale edit must not win.',
      expectedVersion: created.version,
    });
    expect(staleResponse.statusCode).toBe(409);
    expect(ApiErrorResponseSchema.parse(staleResponse.json()).code).toBe(
      ApiErrorCode.RoomVersionConflict,
    );

    const liveResponse = await updateRoom(headers, created.id, {
      expectedVersion: edited.version,
      status: 'LIVE',
    });
    const live = UpdateRoomResponseSchema.parse(liveResponse.json()).room;
    expect(live).toMatchObject({ status: 'LIVE', version: 3 });

    const publicResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/rooms/${created.id}`,
      });
    expect(publicResponse.statusCode).toBe(200);

    const endedResponse = await updateRoom(headers, created.id, {
      expectedVersion: live.version,
      status: 'ENDED',
    });
    const ended = UpdateRoomResponseSchema.parse(endedResponse.json()).room;
    expect(ended).toMatchObject({ status: 'ENDED', version: 4 });

    const reverseResponse = await updateRoom(headers, created.id, {
      expectedVersion: ended.version,
      status: 'LIVE',
    });
    expect(reverseResponse.statusCode).toBe(409);
    expect(ApiErrorResponseSchema.parse(reverseResponse.json()).code).toBe(
      ApiErrorCode.RoomInvalidTransition,
    );
  });

  it('keeps only one live broadcast per host and lists ended history in pages', async () => {
    const headers = await authenticatedHeaders('host@example.com');
    const first = CreateRoomResponseSchema.parse(
      (await createRoom(headers, roomInput)).json(),
    ).room;
    const second = CreateRoomResponseSchema.parse(
      (
        await createRoom(headers, { ...roomInput, title: 'Second show' })
      ).json(),
    ).room;
    const live = await updateRoom(headers, first.id, {
      expectedVersion: 1,
      status: 'LIVE',
    });
    expect(live.statusCode).toBe(200);
    const blocked = await updateRoom(headers, second.id, {
      expectedVersion: 1,
      status: 'LIVE',
    });
    expect(blocked.statusCode).toBe(409);
    const current = await app.getHttpAdapter().getInstance().inject({
      headers,
      method: 'GET',
      url: '/api/v1/rooms/mine/current',
    });
    expect(CurrentBroadcastResponseSchema.parse(current.json()).room?.id).toBe(
      first.id,
    );
    await updateRoom(headers, first.id, {
      expectedVersion: 2,
      status: 'ENDED',
    });
    const nextLive = await updateRoom(headers, second.id, {
      expectedVersion: 1,
      status: 'LIVE',
    });
    expect(nextLive.statusCode).toBe(200);
    await updateRoom(headers, second.id, {
      expectedVersion: 2,
      status: 'ENDED',
    });

    const firstPage = await app.getHttpAdapter().getInstance().inject({
      headers,
      method: 'GET',
      url: '/api/v1/rooms/mine/history?limit=1&q=show',
    });
    const page = ListBroadcastHistoryResponseSchema.parse(firstPage.json());
    expect(page.items.map((room) => room.id)).toEqual([second.id]);
    expect(page.nextCursor).toBeNull();
    const all = await app.getHttpAdapter().getInstance().inject({
      headers,
      method: 'GET',
      url: '/api/v1/rooms/mine/history?limit=1',
    });
    const allPage = ListBroadcastHistoryResponseSchema.parse(all.json());
    expect(allPage.items).toHaveLength(1);
    expect(allPage.nextCursor).toEqual(expect.any(String));
    const secondPage = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers,
        method: 'GET',
        url: `/api/v1/rooms/mine/history?limit=1&cursor=${encodeURIComponent(allPage.nextCursor ?? '')}`,
      });
    const older = ListBroadcastHistoryResponseSchema.parse(secondPage.json());
    expect(older.items).toHaveLength(1);
    expect(older.items[0]?.id).not.toBe(allPage.items[0]?.id);
    expect(older.nextCursor).toBeNull();

    const outsideDate = await app.getHttpAdapter().getInstance().inject({
      headers,
      method: 'GET',
      url: '/api/v1/rooms/mine/history?from=2100-01-01T00%3A00%3A00.000Z',
    });
    expect(
      ListBroadcastHistoryResponseSchema.parse(outsideDate.json()).items,
    ).toEqual([]);
  });

  it('deletes only a draft owned by the host', async () => {
    const headers = await authenticatedHeaders('host@example.com');
    const created = CreateRoomResponseSchema.parse(
      (await createRoom(headers, roomInput)).json(),
    ).room;
    const deleted = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers,
        method: 'DELETE',
        url: `/api/v1/rooms/${created.id}`,
      });
    expect(deleted.statusCode).toBe(200);
    await expect(
      database.room.findUnique({ where: { id: created.id } }),
    ).resolves.toBeNull();
  });

  it('serializes simultaneous attempts to start two broadcasts', async () => {
    const headers = await authenticatedHeaders('host@example.com');
    const first = CreateRoomResponseSchema.parse(
      (await createRoom(headers, roomInput)).json(),
    ).room;
    const second = CreateRoomResponseSchema.parse(
      (
        await createRoom(headers, { ...roomInput, title: 'Parallel show' })
      ).json(),
    ).room;
    const responses = await Promise.all([
      updateRoom(headers, first.id, { expectedVersion: 1, status: 'LIVE' }),
      updateRoom(headers, second.id, { expectedVersion: 1, status: 'LIVE' }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 409,
    ]);
    await expect(
      database.room.count({ where: { hostId: first.hostId, status: 'LIVE' } }),
    ).resolves.toBe(1);
  });

  it('keeps host-management routes unavailable to viewers', async () => {
    const headers = await authenticatedHeaders('viewer@example.com');
    for (const url of [
      '/api/v1/rooms/mine',
      '/api/v1/rooms/mine/current',
      '/api/v1/rooms/mine/history',
    ]) {
      const response = await app.getHttpAdapter().getInstance().inject({
        headers,
        method: 'GET',
        url,
      });
      expect(response.statusCode).toBe(403);
      expect(ApiErrorResponseSchema.parse(response.json()).code).toBe(
        ApiErrorCode.Forbidden,
      );
    }
  });

  it('paginates visible rooms without exposing drafts or duplicating ties', async () => {
    const host = await database.user.findUniqueOrThrow({
      where: { email: 'host@example.com' },
    });
    await database.room.createMany({
      data: [
        roomRecord(
          'ffffffff-ffff-4fff-bfff-ffffffffffff',
          host.id,
          'LIVE',
          '2026-10-09T15:30:00.000Z',
        ),
        roomRecord(
          'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
          host.id,
          'ENDED',
          '2026-10-09T15:30:00.000Z',
        ),
        roomRecord(
          '11111111-1111-4111-8111-111111111111',
          host.id,
          'LIVE',
          '2026-10-09T15:00:00.000Z',
        ),
        roomRecord(
          '22222222-2222-4222-8222-222222222222',
          host.id,
          'DRAFT',
          '2026-10-09T16:00:00.000Z',
        ),
      ],
    });

    const firstResponse = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/rooms?limit=2',
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstPage = ListRoomsResponseSchema.parse(firstResponse.json());
    expect(firstPage.items.map(({ id }) => id)).toEqual([
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/rooms?limit=2&cursor=${firstPage.nextCursor}`,
      });
    expect(secondResponse.statusCode).toBe(200);
    const secondPage = ListRoomsResponseSchema.parse(secondResponse.json());
    expect(secondPage.items.map(({ id }) => id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(secondPage.nextCursor).toBeNull();

    const allIds = [...firstPage.items, ...secondPage.items].map(
      ({ id }) => id,
    );
    expect(new Set(allIds).size).toBe(3);
    expect(allIds).not.toContain('22222222-2222-4222-8222-222222222222');
  });

  it('searches all visible rooms before paginating and treats SQL wildcards literally', async () => {
    const host = await database.user.findUniqueOrThrow({
      where: { email: 'host@example.com' },
    });
    await database.room.createMany({
      data: [
        {
          ...roomRecord(
            '11111111-1111-4111-8111-111111111111',
            host.id,
            'LIVE',
            '2026-10-09T17:00:00.000Z',
          ),
          description: 'Latest headlines.',
          title: 'Morning news',
        },
        {
          ...roomRecord(
            '22222222-2222-4222-8222-222222222222',
            host.id,
            'LIVE',
            '2026-10-09T16:00:00.000Z',
          ),
          title: 'Design critique',
        },
        {
          ...roomRecord(
            '33333333-3333-4333-8333-333333333333',
            host.id,
            'ENDED',
            '2026-10-09T15:00:00.000Z',
          ),
          description: 'Weekly design review.',
          title: 'Morning jazz',
        },
        {
          ...roomRecord(
            '44444444-4444-4444-8444-444444444444',
            host.id,
            'LIVE',
            '2026-10-09T14:00:00.000Z',
          ),
          title: 'DESIGN lab',
        },
        {
          ...roomRecord(
            '55555555-5555-4555-8555-555555555555',
            host.id,
            'DRAFT',
            '2026-10-09T13:00:00.000Z',
          ),
          title: 'Design hidden',
        },
        {
          ...roomRecord(
            '66666666-6666-4666-8666-666666666666',
            host.id,
            'LIVE',
            '2026-10-09T12:00:00.000Z',
          ),
          title: '100% Complete',
        },
      ],
    });

    const firstResponse = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/rooms?limit=2&q=design',
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstPage = ListRoomsResponseSchema.parse(firstResponse.json());
    expect(firstPage.items.map(({ id }) => id)).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondResponse = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/rooms?limit=2&q=DeSiGn&cursor=${firstPage.nextCursor}`,
      });
    expect(secondResponse.statusCode).toBe(200);
    const secondPage = ListRoomsResponseSchema.parse(secondResponse.json());
    expect(secondPage.items.map(({ id }) => id)).toEqual([
      '44444444-4444-4444-8444-444444444444',
    ]);
    expect(secondPage.nextCursor).toBeNull();

    const percentResponse = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/rooms?q=%25',
    });
    expect(percentResponse.statusCode).toBe(200);
    expect(
      ListRoomsResponseSchema.parse(percentResponse.json()).items.map(
        ({ id }) => id,
      ),
    ).toEqual(['66666666-6666-4666-8666-666666666666']);
  });

  it('suggests public users and room titles with clickable identifiers', async () => {
    const host = await database.user.update({
      data: { name: 'Marina Brown', username: 'streamqueen' },
      where: { email: 'host@example.com' },
    });
    const viewer = await database.user.findUniqueOrThrow({
      where: { email: 'viewer@example.com' },
    });
    await database.room.createMany({
      data: [
        {
          ...roomRecord(
            'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
            host.id,
            'LIVE',
            '2026-10-09T15:30:00.000Z',
          ),
          title: 'Sunset Jazz',
        },
        {
          ...roomRecord(
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            host.id,
            'DRAFT',
            '2026-10-09T15:31:00.000Z',
          ),
          title: 'Sunset rehearsal',
        },
        {
          ...roomRecord(
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            viewer.id,
            'ENDED',
            '2026-10-09T15:29:00.000Z',
          ),
          title: 'Morning show',
        },
      ],
    });

    const byName = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/search?q=marina',
    });
    expect(byName.statusCode).toBe(200);
    expect(SearchSuggestionsResponseSchema.parse(byName.json()).users).toEqual([
      expect.objectContaining({ id: host.id, name: 'Marina Brown' }),
    ]);
    expect(byName.body).not.toContain('host@example.com');

    const byUsername = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/search?q=STREAMQUEEN',
    });
    expect(
      SearchSuggestionsResponseSchema.parse(byUsername.json()).users,
    ).toEqual([
      expect.objectContaining({ id: host.id, username: 'streamqueen' }),
    ]);

    const byTitle = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/search?q=sunset',
    });
    expect(
      SearchSuggestionsResponseSchema.parse(byTitle.json()).rooms.map(
        ({ id }) => id,
      ),
    ).toEqual(['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa']);

    const profile = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/users/${host.id}`,
      });
    expect(profile.statusCode).toBe(200);
    expect(
      GetPublicUserResponseSchema.parse(profile.json()).user,
    ).toMatchObject({
      id: host.id,
      name: 'Marina Brown',
    });
    expect(profile.body).not.toContain('host@example.com');

    const wildcard = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/search?q=%25',
    });
    expect(
      SearchSuggestionsResponseSchema.parse(wildcard.json()).users,
    ).toEqual([]);

    const invalidQuery = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/search?q=',
    });
    expect(invalidQuery.statusCode).toBe(400);

    const ownRooms = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/rooms?hostId=${host.id}`,
      });
    expect(
      ListRoomsResponseSchema.parse(ownRooms.json()).items.map(({ id }) => id),
    ).toEqual(['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa']);
  });

  it('returns visible room details while hiding drafts as not found', async () => {
    const host = await database.user.findUniqueOrThrow({
      where: { email: 'host@example.com' },
    });
    const visibleId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const draftId = '22222222-2222-4222-8222-222222222222';
    await database.room.createMany({
      data: [
        roomRecord(visibleId, host.id, 'LIVE', '2026-10-09T15:30:00.000Z'),
        roomRecord(draftId, host.id, 'DRAFT', '2026-10-09T15:31:00.000Z'),
      ],
    });

    const visible = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/rooms/${visibleId}`,
      });
    const draft = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/rooms/${draftId}`,
      });

    expect(visible.statusCode).toBe(200);
    expect(GetRoomResponseSchema.parse(visible.json()).room.id).toBe(visibleId);
    expect(draft.statusCode).toBe(404);
    expect(ApiErrorResponseSchema.parse(draft.json()).code).toBe(
      ApiErrorCode.NotFound,
    );
  });

  it('keeps room likes idempotent and returns the authoritative count', async () => {
    const host = await database.user.findUniqueOrThrow({
      where: { email: 'host@example.com' },
    });
    const room = await database.room.create({
      data: {
        ...roomInput,
        hostId: host.id,
        status: 'LIVE',
      },
    });
    const viewerHeaders = await authenticatedHeaders('viewer@example.com');

    const initial = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: viewerHeaders,
        method: 'GET',
        url: `/api/v1/rooms/${room.id}/likes/me`,
      });
    expect(RoomLikeResponseSchema.parse(initial.json())).toMatchObject({
      likeCount: 0,
      liked: false,
    });

    for (const expectedCount of [1, 1]) {
      const liked = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          headers: viewerHeaders,
          method: 'PUT',
          url: `/api/v1/rooms/${room.id}/likes/me`,
        });
      expect(liked.statusCode).toBe(200);
      expect(RoomLikeResponseSchema.parse(liked.json())).toMatchObject({
        likeCount: expectedCount,
        liked: true,
      });
    }

    await expect(
      database.roomLike.count({ where: { roomId: room.id } }),
    ).resolves.toBe(1);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const unliked = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          headers: viewerHeaders,
          method: 'DELETE',
          url: `/api/v1/rooms/${room.id}/likes/me`,
        });
      expect(unliked.statusCode).toBe(204);
    }

    await expect(
      database.roomLike.count({ where: { roomId: room.id } }),
    ).resolves.toBe(0);
  });

  it('protects likes with authentication, CSRF, and public visibility', async () => {
    const host = await database.user.findUniqueOrThrow({
      where: { email: 'host@example.com' },
    });
    const draft = await database.room.create({
      data: { ...roomInput, hostId: host.id },
    });
    const viewerHeaders = await authenticatedHeaders('viewer@example.com');

    const anonymous = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'PUT',
        url: `/api/v1/rooms/${draft.id}/likes/me`,
      });
    expect(anonymous.statusCode).toBe(401);

    const missingCsrf = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { cookie: viewerHeaders.cookie },
        method: 'PUT',
        url: `/api/v1/rooms/${draft.id}/likes/me`,
      });
    expect(missingCsrf.statusCode).toBe(403);

    const hiddenDraft = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: viewerHeaders,
        method: 'PUT',
        url: `/api/v1/rooms/${draft.id}/likes/me`,
      });
    expect(hiddenDraft.statusCode).toBe(404);
    await expect(database.roomLike.count()).resolves.toBe(0);
  });

  it('upserts expiring room mutes and audits every host action', async () => {
    const host = await database.user.findUniqueOrThrow({
      where: { email: 'host@example.com' },
    });
    const viewer = await database.user.findUniqueOrThrow({
      where: { email: 'viewer@example.com' },
    });
    const room = await database.room.create({
      data: { ...roomInput, hostId: host.id, status: 'LIVE' },
    });
    const headers = await authenticatedHeaders('host@example.com');

    for (const durationMinutes of [5, 10]) {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          headers,
          method: 'POST',
          payload: { durationMinutes, userId: viewer.id },
          url: `/api/v1/rooms/${room.id}/mutes`,
        });

      expect(response.statusCode).toBe(201);
      expect(
        MuteRoomUserResponseSchema.parse(response.json()).mute,
      ).toMatchObject({
        mutedBy: host.id,
        roomId: room.id,
        userId: viewer.id,
      });
    }

    await expect(
      database.roomMute.count({
        where: { roomId: room.id, userId: viewer.id },
      }),
    ).resolves.toBe(1);
    await expect(
      database.auditLog.count({
        where: {
          action: 'ROOM_USER_MUTED',
          actorId: host.id,
          roomId: room.id,
          targetId: viewer.id,
        },
      }),
    ).resolves.toBe(2);
  });

  it('rejects room mute attempts from viewers', async () => {
    const host = await database.user.findUniqueOrThrow({
      where: { email: 'host@example.com' },
    });
    const room = await database.room.create({
      data: { ...roomInput, hostId: host.id, status: 'LIVE' },
    });
    const headers = await authenticatedHeaders('viewer@example.com');
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers,
        method: 'POST',
        payload: { durationMinutes: 10, userId: host.id },
        url: `/api/v1/rooms/${room.id}/mutes`,
      });

    expect(response.statusCode).toBe(403);
    expect(ApiErrorResponseSchema.parse(response.json()).code).toBe(
      ApiErrorCode.Forbidden,
    );
    await expect(database.roomMute.count()).resolves.toBe(0);
    await expect(database.auditLog.count()).resolves.toBe(0);
  });

  it('rejects malformed identifiers and cursors with stable validation errors', async () => {
    const invalidId = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/rooms/not-a-uuid',
    });
    const invalidCursor = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/rooms?cursor=not%2Bbase64url',
    });

    expect(invalidId.statusCode).toBe(400);
    expect(invalidCursor.statusCode).toBe(400);
    expect(ApiErrorResponseSchema.parse(invalidId.json()).code).toBe(
      ApiErrorCode.ValidationError,
    );
    expect(ApiErrorResponseSchema.parse(invalidCursor.json()).code).toBe(
      ApiErrorCode.ValidationError,
    );
  });

  async function authenticatedHeaders(email: string) {
    const loginResponse = await signIn(app, email, password);

    expect(loginResponse.statusCode).toBe(200);

    return {
      cookie: cookiePair(sessionCookie(loginResponse)),
      origin: 'http://localhost:3000',
    };
  }

  async function createRoom(
    headers: Record<string, string>,
    payload: Record<string, unknown>,
  ) {
    return app.getHttpAdapter().getInstance().inject({
      headers,
      method: 'POST',
      payload,
      url: '/api/v1/rooms',
    });
  }

  async function updateRoom(
    headers: Record<string, string>,
    id: string,
    payload: Record<string, unknown>,
  ) {
    return app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers,
        method: 'PATCH',
        payload,
        url: `/api/v1/rooms/${id}`,
      });
  }
});

function cookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0] ?? '';
}

function roomRecord(
  id: string,
  hostId: string,
  status: 'DRAFT' | 'ENDED' | 'LIVE',
  createdAt: string,
) {
  return {
    ...roomInput,
    createdAt: new Date(createdAt),
    hostId,
    id,
    status,
    updatedAt: new Date(createdAt),
  };
}
