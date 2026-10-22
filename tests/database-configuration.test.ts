import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('database configuration', () => {
  it('pins the PostgreSQL image and persists PostgreSQL 18 data correctly', async () => {
    const composePath = resolve(process.cwd(), 'infra/compose/compose.yml');
    const compose = await readFile(composePath, 'utf8');

    expect(compose).toContain('image: postgres:18.6-alpine3.24');
    expect(compose).toContain('postgres-data:/var/lib/postgresql');
    expect(compose).not.toMatch(/image:\s+postgres:(latest|18-alpine)/);
  });

  it('documents a local database URL without committing a real environment file', async () => {
    const examplePath = resolve(process.cwd(), '.env.example');
    const example = await readFile(examplePath, 'utf8');

    expect(example).toContain('DATABASE_URL=postgresql://');
    expect(example).toContain('@localhost:5432/livepulse');
    expect(example).toContain('AUTH_COOKIE_DOMAIN=');
    expect(example).toContain('GOOGLE_CLIENT_ID=');
    expect(example).toContain('GOOGLE_CLIENT_SECRET=');
    expect(example).toContain('LIVEKIT_URL=wss://');
    expect(example).toContain('LIVEKIT_API_KEY=');
    expect(example).toContain('LIVEKIT_API_SECRET=');

    const compose = await readFile(
      resolve(process.cwd(), 'infra/compose/compose.yml'),
      'utf8',
    );
    expect(compose).toContain('GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}');
    expect(compose).toContain('AUTH_COOKIE_DOMAIN: ${AUTH_COOKIE_DOMAIN:-}');
    expect(compose).toContain(
      'GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}',
    );
    expect(compose).toContain('LIVEKIT_API_KEY: ${LIVEKIT_API_KEY:-}');
    expect(compose).toContain('LIVEKIT_API_SECRET: ${LIVEKIT_API_SECRET:-}');
    expect(compose).toContain('LIVEKIT_URL: ${LIVEKIT_URL:-}');
  });

  it('models identities, sessions, and host-owned rooms', async () => {
    const schemaPath = resolve(
      process.cwd(),
      'packages/db/prisma/schema.prisma',
    );
    const schema = await readFile(schemaPath, 'utf8');

    expect(schema).toMatch(/email\s+String\s+@unique/);
    expect(schema).toMatch(/username\s+String\?\s+@unique/);
    expect(schema).toContain('@@map("registration_challenges")');
    expect(schema).toMatch(/token\s+String\s+@unique/);
    expect(schema).toContain('@@map("auth_sessions")');
    expect(schema).toContain('@@map("auth_accounts")');
    expect(schema).not.toContain('RefreshSession');
    expect(
      schema.slice(
        schema.indexOf('model User {'),
        schema.indexOf('model RegistrationChallenge {'),
      ),
    ).not.toContain('passwordHash');
    expect(schema).toMatch(
      /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt/,
    );
    expect(schema).toContain('onDelete: Cascade');
    expect(schema).toMatch(/hostId\s+String\s+@map\("host_id"\)/);
    expect(schema).toMatch(/status\s+RoomStatus\s+@default\(DRAFT\)/);
    expect(schema).toMatch(/version\s+Int\s+@default\(1\)/);
    expect(schema).toMatch(
      /coverImageUrl\s+String\?\s+@map\("cover_image_url"\)\s+@db\.Text/,
    );
    expect(schema).not.toContain('demoVideoUrl');
    expect(schema).toContain(
      '@relation(fields: [hostId], references: [id], onDelete: Restrict)',
    );
    expect(schema).toContain('@@index([status, createdAt, id])');

    const migration = await readFile(
      resolve(
        process.cwd(),
        'packages/db/prisma/migrations/20261020023000_optional_generated_room_cover/migration.sql',
      ),
      'utf8',
    );
    expect(migration).toContain('ALTER COLUMN "cover_image_url" DROP NOT NULL');
    expect(migration).toContain('DROP COLUMN "demo_video_url"');
  });
});
