import { log } from 'node:console';
import process from 'node:process';

import { createDatabaseClient } from '../dist/src/index.js';
import { demoRooms } from './demo-rooms.mjs';

const databaseUrl = process.env.DATABASE_URL;
const hostEmail = process.env.DEMO_HOST_EMAIL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const database = createDatabaseClient(databaseUrl);

try {
  // Rooms belong to an existing host or admin; no accounts are created here.
  const host = await database.user.findFirst({
    orderBy: { createdAt: 'asc' },
    where: hostEmail
      ? { email: hostEmail }
      : { role: { in: ['HOST', 'ADMIN'] } },
  });

  if (!host) {
    throw new Error(
      'No host account found. Sign up a host first or set DEMO_HOST_EMAIL.',
    );
  }

  for (const { id, ...room } of demoRooms) {
    await database.room.upsert({
      create: { ...room, hostId: host.id, id },
      update: { ...room, hostId: host.id },
      where: { id },
    });
  }

  log(`Seeded ${demoRooms.length} demo rooms for ${host.email}`);
} finally {
  await database.$disconnect();
}
