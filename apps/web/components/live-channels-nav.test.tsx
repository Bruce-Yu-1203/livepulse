import type { VisibleRoom } from '@livepulse/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthSessionProvider } from './auth-session-provider';
import { LiveChannelsNav, readRailCollapsed } from './live-channels-nav';

function room(overrides: Partial<VisibleRoom>): VisibleRoom {
  return {
    coverImageUrl: null,
    createdAt: '2026-10-09T15:30:00.000Z',
    description: 'Learn distributed systems with a live audience.',
    hostId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    likeCount: 1200,
    status: 'LIVE',
    title: 'Architecture Lab',
    updatedAt: '2026-10-09T15:30:00.000Z',
    version: 1,
    ...overrides,
  };
}

function renderNav(rooms: VisibleRoom[], activeRoomId?: string) {
  return renderToStaticMarkup(
    <AuthSessionProvider initialSession={{ status: 'anonymous' }}>
      <LiveChannelsNav activeRoomId={activeRoomId} rooms={rooms} />
    </AuthSessionProvider>,
  );
}

describe('LiveChannelsNav', () => {
  it('lists live rooms before ended rooms as a labelled navigation', () => {
    const markup = renderNav([
      room({ id: 'ended-room', status: 'ENDED', title: 'Old Stream' }),
      room({ id: 'live-room', title: 'Architecture Lab' }),
    ]);

    expect(markup).toContain('aria-label="Live channels"');
    expect(markup.indexOf('Architecture Lab')).toBeLessThan(
      markup.indexOf('Old Stream'),
    );
    expect(markup).toContain('href="/rooms/live-room"');
    expect(markup).toContain('Live, ');
    expect(markup).toContain('>Ended<');
  });

  it('is not an aside, so the room chat stays the only complementary region', () => {
    expect(renderNav([room({})])).not.toContain('<aside');
  });

  it('marks the room being watched as the current page', () => {
    expect(renderNav([room({ id: 'live-room' })], 'live-room')).toContain(
      'aria-current="page"',
    );
  });

  it('explains the empty state', () => {
    expect(renderNav([])).toContain(
      'Rooms appear here when hosts publish them.',
    );
  });

  it('starts expanded with a collapse control', () => {
    const markup = renderNav([room({})]);

    expect(markup).toContain('aria-label="Collapse live channels"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).not.toContain('channel-rail-collapsed');
  });

  it('only treats an explicit saved choice as collapsed', () => {
    expect(readRailCollapsed('true')).toBe(true);
    expect(readRailCollapsed('false')).toBe(false);
    expect(readRailCollapsed(null)).toBe(false);
  });
});

describe('LiveChannelsNav avatars', () => {
  it('colours avatars by room name and dims ended rooms', () => {
    const markup = renderNav([
      room({ id: 'live-room' }),
      room({ id: 'ended-room', status: 'ENDED', title: 'Old Stream' }),
    ]);

    expect(markup).toMatch(/channel-avatar avatar-tone-\d channel-avatar-live/);
    expect(markup).toMatch(
      /channel-avatar avatar-tone-\d channel-avatar-ended/,
    );
  });
});
