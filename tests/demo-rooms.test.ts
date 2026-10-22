import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- plain ESM seed data without type declarations
import { demoRooms } from '../packages/db/prisma/demo-rooms.mjs';

type DemoRoom = {
  coverImageUrl: string | null;
  description: string;
  id: string;
  status: string;
  title: string;
};

const rooms = demoRooms as DemoRoom[];

describe('demo room seed', () => {
  it('provides several unique rooms that fit the schema limits', () => {
    expect(rooms.length).toBeGreaterThanOrEqual(8);
    expect(new Set(rooms.map((room) => room.id)).size).toBe(rooms.length);

    for (const room of rooms) {
      expect(room.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(room.title.length).toBeGreaterThan(0);
      expect(room.title.length).toBeLessThanOrEqual(120);
      expect(room.description.length).toBeLessThanOrEqual(2000);
      expect(['LIVE', 'ENDED']).toContain(room.status);
      if (room.coverImageUrl) {
        expect(room.coverImageUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it('mixes live and ended rooms', () => {
    const statuses = new Set(rooms.map((room) => room.status));
    expect(statuses).toEqual(new Set(['LIVE', 'ENDED']));
  });

  it('upserts rooms for an existing host and needs an explicit database', async () => {
    const script = await readFile(
      resolve(process.cwd(), 'packages/db/prisma/seed-rooms.mjs'),
      'utf8',
    );

    expect(script).toContain('room.upsert');
    expect(script).toContain('process.env.DATABASE_URL');
    expect(script).not.toContain('user.upsert');
    expect(script).not.toContain('localhost');
  });
});
