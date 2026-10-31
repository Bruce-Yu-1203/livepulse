import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RegistrationUsernameSchema } from '@livepulse/contracts';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- plain ESM seed data without type declarations
import { demoHosts, demoRooms } from '../packages/db/prisma/demo-rooms.mjs';

type DemoHost = { email: string; id: string; name: string; username: string };
type DemoRoom = {
  coverImageUrl: string | null;
  description: string;
  hostId: string;
  id: string;
  likes: number;
  status: string;
  title: string;
};

const hosts = demoHosts as DemoHost[];
const rooms = demoRooms as DemoRoom[];
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('demo room seed', () => {
  it('provides several unique rooms that fit the schema limits', () => {
    expect(rooms.length).toBeGreaterThanOrEqual(12);
    expect(new Set(rooms.map((room) => room.id)).size).toBe(rooms.length);

    for (const room of rooms) {
      expect(room.id).toMatch(uuid);
      expect(room.title.length).toBeGreaterThan(0);
      expect(room.title.length).toBeLessThanOrEqual(120);
      expect(room.description.length).toBeLessThanOrEqual(2000);
      expect(['LIVE', 'ENDED']).toContain(room.status);
      if (room.coverImageUrl) {
        expect(room.coverImageUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it('gives every room a demo host and each host at most one live room', () => {
    const hostIds = new Set(hosts.map((host) => host.id));
    const liveByHost = new Map<string, number>();
    for (const room of rooms) {
      expect(hostIds.has(room.hostId)).toBe(true);
      if (room.status === 'LIVE') {
        liveByHost.set(room.hostId, (liveByHost.get(room.hostId) ?? 0) + 1);
      }
    }
    expect([...liveByHost.values()].every((count) => count === 1)).toBe(true);
    expect(liveByHost.size).toBeGreaterThanOrEqual(10);
  });

  it('uses valid, unique demo host identities that cannot receive mail', () => {
    expect(new Set(hosts.map((host) => host.id)).size).toBe(hosts.length);
    expect(new Set(hosts.map((host) => host.username)).size).toBe(hosts.length);
    for (const host of hosts) {
      expect(host.id).toMatch(uuid);
      expect(RegistrationUsernameSchema.safeParse(host.username).success).toBe(
        true,
      );
      expect(host.email).toMatch(/@demo\.livepulse\.invalid$/);
    }
  });

  it('asks for no more likes than there are other demo hosts', () => {
    for (const room of rooms) {
      expect(room.likes).toBeGreaterThanOrEqual(0);
      expect(room.likes).toBeLessThanOrEqual(hosts.length - 1);
    }
  });

  it('mixes live and ended rooms', () => {
    const statuses = new Set(rooms.map((room) => room.status));
    expect(statuses).toEqual(new Set(['LIVE', 'ENDED']));
  });

  it('upserts demo rows, ends rooms before going live, and needs an explicit database', async () => {
    const script = await readFile(
      resolve(process.cwd(), 'packages/db/prisma/seed-rooms.mjs'),
      'utf8',
    );

    expect(script).toContain('room.upsert');
    expect(script).toContain('user.upsert');
    expect(script).toContain('process.env.DATABASE_URL');
    expect(script).not.toContain('localhost');
    // Demo hosts never get a password or OAuth account.
    expect(script).not.toContain('account.');
    expect(script.indexOf("room.status !== 'LIVE'")).toBeLessThan(
      script.indexOf("room.status === 'LIVE'"),
    );
  });
});
