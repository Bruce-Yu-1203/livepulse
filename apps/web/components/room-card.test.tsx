import type { VisibleRoom } from '@livepulse/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RoomCard } from './room-card';

const room: VisibleRoom = {
  coverImageUrl: 'https://cdn.example.com/cover.jpg',
  createdAt: '2026-10-09T15:30:00.000Z',
  demoVideoUrl: 'https://video.example.com/demo.mp4',
  description: 'Learn distributed systems with a live audience.',
  hostId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  status: 'LIVE',
  title: 'Architecture Lab',
  updatedAt: '2026-10-09T15:30:00.000Z',
  version: 1,
};

describe('RoomCard', () => {
  it('renders a discoverable link and the room state', () => {
    const html = renderToStaticMarkup(createElement(RoomCard, { room }));

    expect(html).toContain(`/rooms/${room.id}`);
    expect(html).toContain('Architecture Lab');
    expect(html).toContain('Live now');
    expect(html).toContain('Learn distributed systems');
  });
});
