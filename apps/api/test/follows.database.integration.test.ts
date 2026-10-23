import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  FollowListResponseSchema,
  FollowStateResponseSchema,
  GetPublicUserResponseSchema,
} from '@livepulse/contracts';
import { createDatabaseClient } from '@livepulse/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/create-app.js';
import {
  cookiePair,
  createCredentialUser,
  sessionCookie,
  signIn,
} from './auth-test-helpers.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for follow tests');
const database = createDatabaseClient(databaseUrl);
const password = 'correct horse battery staple';

describe('user follows', () => {
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
      email: 'alice@example.com',
      password,
    });
    await createCredentialUser(database, {
      email: 'bruce@example.com',
      password,
    });
    await database.user.create({
      data: { email: 'carol@example.com', name: 'Carol' },
    });
  });

  afterAll(async () => {
    await app.close();
    await database.$disconnect();
  });

  it('follows idempotently and updates public counts and lists', async () => {
    const alice = await database.user.findUniqueOrThrow({
      where: { email: 'alice@example.com' },
    });
    const bruce = await database.user.findUniqueOrThrow({
      where: { email: 'bruce@example.com' },
    });
    const login = await signIn(app, alice.email, password);
    const headers = {
      cookie: cookiePair(sessionCookie(login)),
      origin: 'http://localhost:3000',
    };
    const url = `/api/v1/users/${bruce.id}/follow`;

    for (const expectedCount of [1, 1]) {
      const followed = await app.getHttpAdapter().getInstance().inject({
        headers,
        method: 'PUT',
        url,
      });
      expect(followed.statusCode).toBe(200);
      expect(FollowStateResponseSchema.parse(followed.json())).toMatchObject({
        followerCount: expectedCount,
        following: true,
      });
    }
    expect(await database.userFollow.count()).toBe(1);

    const profile = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/users/${bruce.id}`,
      });
    expect(
      GetPublicUserResponseSchema.parse(profile.json()).user,
    ).toMatchObject({
      followerCount: 1,
      followingCount: 0,
    });
    expect(profile.body).not.toContain(bruce.email);

    const followers = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/users/${bruce.id}/followers`,
      });
    expect(FollowListResponseSchema.parse(followers.json()).items).toEqual([
      expect.objectContaining({ id: alice.id }),
    ]);
    expect(followers.body).not.toContain(alice.email);
    const following = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/users/${alice.id}/following`,
      });
    expect(FollowListResponseSchema.parse(following.json()).items).toEqual([
      expect.objectContaining({ id: bruce.id }),
    ]);

    for (const expectedCount of [0, 0]) {
      const removed = await app.getHttpAdapter().getInstance().inject({
        headers,
        method: 'DELETE',
        url,
      });
      expect(FollowStateResponseSchema.parse(removed.json())).toMatchObject({
        followerCount: expectedCount,
        following: false,
      });
    }
    expect(await database.userFollow.count()).toBe(0);
  });

  it('supports mutual follows, paginates lists, and blocks self-follow', async () => {
    const [alice, bruce, carol] = await Promise.all([
      database.user.findUniqueOrThrow({
        where: { email: 'alice@example.com' },
      }),
      database.user.findUniqueOrThrow({
        where: { email: 'bruce@example.com' },
      }),
      database.user.findUniqueOrThrow({
        where: { email: 'carol@example.com' },
      }),
    ]);
    await database.userFollow.createMany({
      data: [
        { followerId: alice.id, followedId: bruce.id },
        { followerId: bruce.id, followedId: alice.id },
        { followerId: carol.id, followedId: bruce.id },
      ],
    });
    const first = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/users/${bruce.id}/followers?limit=1&page=1`,
      });
    const firstPage = FollowListResponseSchema.parse(first.json());
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextPage).toBe(2);
    const second = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: `/api/v1/users/${bruce.id}/followers?limit=1&page=2`,
      });
    const secondPage = FollowListResponseSchema.parse(second.json());
    expect(secondPage.nextPage).toBeNull();
    expect(
      new Set([...firstPage.items, ...secondPage.items].map((user) => user.id)),
    ).toEqual(new Set([alice.id, carol.id]));

    const login = await signIn(app, alice.email, password);
    const self = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: {
          cookie: cookiePair(sessionCookie(login)),
          origin: 'http://localhost:3000',
        },
        method: 'PUT',
        url: `/api/v1/users/${alice.id}/follow`,
      });
    expect(self.statusCode).toBe(400);
    expect(ApiErrorResponseSchema.parse(self.json()).code).toBe(
      ApiErrorCode.ValidationError,
    );
  });

  it('requires authentication and a trusted origin for changes', async () => {
    const bruce = await database.user.findUniqueOrThrow({
      where: { email: 'bruce@example.com' },
    });
    const url = `/api/v1/users/${bruce.id}/follow`;
    const anonymous = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { origin: 'http://localhost:3000' },
        method: 'PUT',
        url,
      });
    expect(anonymous.statusCode).toBe(401);
    const login = await signIn(app, 'alice@example.com', password);
    const missingOrigin = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { cookie: cookiePair(sessionCookie(login)) },
        method: 'PUT',
        url,
      });
    expect(missingOrigin.statusCode).toBe(403);
    expect(await database.userFollow.count()).toBe(0);
  });
});
