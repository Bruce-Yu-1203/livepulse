import { randomBytes, scrypt } from 'node:crypto';
import { log } from 'node:console';
import process from 'node:process';

import { createDatabaseClient } from '../dist/src/index.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://livepulse:livepulse_dev_password@localhost:5432/livepulse?schema=public';
const demoPassword = process.env.DEMO_PASSWORD;

if (!demoPassword || demoPassword.length < 12 || demoPassword.length > 128) {
  throw new Error('DEMO_PASSWORD must contain between 12 and 128 characters');
}

const database = createDatabaseClient(databaseUrl);
const passwordHash = await hashPassword(demoPassword);

try {
  const result = await database.$transaction(async (transaction) => {
    const host = await upsertUser(
      transaction,
      '11111111-1111-4111-8111-111111111111',
      'host@livepulse.local',
      'HOST',
      passwordHash,
    );
    await upsertUser(
      transaction,
      '22222222-2222-4222-8222-222222222222',
      'viewer@livepulse.local',
      'VIEWER',
      passwordHash,
    );
    await upsertUser(
      transaction,
      '33333333-3333-4333-8333-333333333333',
      'admin@livepulse.local',
      'ADMIN',
      passwordHash,
    );

    const room = await transaction.room.upsert({
      create: {
        coverImageUrl:
          'https://images.unsplash.com/photo-1516321318423-f06f85e504b3',
        demoVideoUrl:
          'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        description:
          'A seeded live room for trying chat, danmaku, likes, reports, and moderation.',
        hostId: host.id,
        id: '44444444-4444-4444-8444-444444444444',
        status: 'LIVE',
        title: 'LivePulse MVP demo',
      },
      update: {
        coverImageUrl:
          'https://images.unsplash.com/photo-1516321318423-f06f85e504b3',
        demoVideoUrl:
          'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        description:
          'A seeded live room for trying chat, danmaku, likes, reports, and moderation.',
        hostId: host.id,
        status: 'LIVE',
        title: 'LivePulse MVP demo',
      },
      where: { id: '44444444-4444-4444-8444-444444444444' },
    });

    return { roomId: room.id };
  });

  log(`Seeded LivePulse demo room ${result.roomId}`);
  log(
    'Demo users: host@livepulse.local, viewer@livepulse.local, admin@livepulse.local',
  );
} finally {
  await database.$disconnect();
}

async function upsertUser(transaction, id, email, role, passwordHash) {
  const user = await transaction.user.upsert({
    create: { email, id, name: email.split('@')[0], role },
    update: { name: email.split('@')[0], role },
    where: { email },
  });

  await transaction.account.upsert({
    create: {
      accountId: user.id,
      password: passwordHash,
      providerId: 'credential',
      userId: user.id,
    },
    update: { password: passwordHash },
    where: {
      providerId_accountId: {
        accountId: user.id,
        providerId: 'credential',
      },
    },
  });

  return user;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 16_384, maxmem: 32 * 1024 * 1024, p: 5, r: 8 },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(key);
      },
    );
  });

  return `scrypt$v1$16384$8$5$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}
