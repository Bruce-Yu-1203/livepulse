import type { VisibleRoom } from '@livepulse/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RoomCard } from './room-card';

const room: VisibleRoom = {
  coverImageUrl: 'https://cdn.example.com/cover.jpg',
  createdAt: '2026-10-09T15:30:00.000Z',
  description: 'Learn distributed systems with a live audience.',
  hostId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  likeCount: 24,
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
    expect(html).toContain('24');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('dateTime="2026-10-09T15:30:00.000Z"');
    expect(html).toContain('Enter room');
    expect(html).toContain('24 likes');
  });

  it('shows replay status and artwork when a room has no cover', () => {
    const html = renderToStaticMarkup(
      createElement(RoomCard, {
        room: { ...room, coverImageUrl: null, status: 'ENDED' },
      }),
    );

    expect(html).toContain('Ended');
    expect(html).toContain('room-card-placeholder');
    expect(html).not.toContain('<img');
  });
});
