import type { Room } from '@livepulse/contracts';
import { describe, expect, it } from 'vitest';

import { nextRoomStatus, replaceRoom, roomActionLabel } from './studio';

const draftRoom: Room = {
  coverImageUrl: 'https://cdn.example.com/cover.jpg',
  createdAt: '2026-10-09T15:30:00.000Z',
  demoVideoUrl: 'https://video.example.com/demo.mp4',
  description: 'A room prepared for a live audience.',
  hostId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  status: 'DRAFT',
  title: 'Architecture Lab',
  updatedAt: '2026-10-09T15:30:00.000Z',
  version: 1,
};

describe('studio room helpers', () => {
  it('describes the one-way room lifecycle', () => {
    expect(nextRoomStatus('DRAFT')).toBe('LIVE');
    expect(roomActionLabel('DRAFT')).toBe('Go live');
    expect(nextRoomStatus('LIVE')).toBe('ENDED');
    expect(roomActionLabel('LIVE')).toBe('End broadcast');
    expect(nextRoomStatus('ENDED')).toBeUndefined();
    expect(roomActionLabel('ENDED')).toBeUndefined();
  });

  it('replaces a room with the latest server version', () => {
    const updated = { ...draftRoom, title: 'Updated lab', version: 2 };

    expect(replaceRoom([draftRoom], updated)).toEqual([updated]);
  });
});
