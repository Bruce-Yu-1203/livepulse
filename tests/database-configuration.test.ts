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
  });

  it('models identities, sessions, and host-owned rooms', async () => {
    const schemaPath = resolve(
      process.cwd(),
      'packages/db/prisma/schema.prisma',
    );
    const schema = await readFile(schemaPath, 'utf8');

    expect(schema).toMatch(/email\s+String\s+@unique/);
    expect(schema).toMatch(/tokenHash\s+String\s+@unique/);
    expect(schema).toMatch(
      /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt/,
    );
    expect(schema).toContain('onDelete: Cascade');
    expect(schema).toMatch(/hostId\s+String\s+@map\("host_id"\)/);
    expect(schema).toMatch(/status\s+RoomStatus\s+@default\(DRAFT\)/);
    expect(schema).toContain(
      '@relation(fields: [hostId], references: [id], onDelete: Restrict)',
    );
    expect(schema).toContain('@@index([status, createdAt, id])');
  });
});
