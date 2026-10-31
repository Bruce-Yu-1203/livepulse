import { log } from 'node:console';
import process from 'node:process';

import { createDatabaseClient } from '../dist/src/index.js';
import { demoHosts, demoRooms } from './demo-rooms.mjs';

const databaseUrl = process.env.DATABASE_URL;
// Optional: an existing account that follows a few demo hosts, so the
// sidebar's Following group has something to show after signing in.
const viewerEmail = process.env.DEMO_VIEWER_EMAIL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const minute = 60_000;
const day = 24 * 60 * minute;
const database = createDatabaseClient(databaseUrl);

try {
  for (const { id, ...host } of demoHosts) {
    await database.user.upsert({
      create: { ...host, emailVerified: true, id, role: 'HOST' },
      update: { ...host, role: 'HOST' },
      where: { id },
    });
  }

  // Ended rooms first, so a host's previous live room is closed before the
  // one-live-room-per-host index sees its new live room.
  const ordered = [
    ...demoRooms.filter((room) => room.status !== 'LIVE'),
    ...demoRooms.filter((room) => room.status === 'LIVE'),
  ];
  const now = Date.now();
  for (const [index, { id, likes, ...room }] of ordered.entries()) {
    const startedAt =
      room.status === 'LIVE'
        ? new Date(now - (15 + index * 11) * minute)
        : new Date(now - (1 + (index % 6)) * day);
    await database.room.upsert({
      create: { ...room, createdAt: startedAt, id, startedAt },
      update: { ...room, startedAt },
      where: { id },
    });

    // Likes come from other demo hosts, giving each room a fixed count.
    const likers = demoHosts
      .map((host) => host.id)
      .filter((userId) => userId !== room.hostId)
      .slice(0, likes);
    await database.roomLike.deleteMany({
      where: {
        roomId: id,
        userId: { in: demoHosts.map((host) => host.id) },
      },
    });
    await database.roomLike.createMany({
      data: likers.map((userId) => ({ roomId: id, userId })),
      skipDuplicates: true,
    });
  }

  if (viewerEmail) {
    const viewer = await database.user.findUnique({
      where: { email: viewerEmail },
    });
    if (!viewer) {
      throw new Error(`No account found for DEMO_VIEWER_EMAIL ${viewerEmail}`);
    }
    await database.userFollow.createMany({
      data: demoHosts
        .slice(0, 4)
        .map((host) => ({ followedId: host.id, followerId: viewer.id })),
      skipDuplicates: true,
    });
  }

  const live = demoRooms.filter((room) => room.status === 'LIVE').length;
  log(
    `Seeded ${demoHosts.length} demo hosts and ${demoRooms.length} rooms (${live} live)` +
      (viewerEmail ? `; ${viewerEmail} follows 4 of them` : ''),
  );
} finally {
  await database.$disconnect();
}
