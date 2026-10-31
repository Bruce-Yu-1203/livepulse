import type { LiveChannel, VisibleRoom } from '@livepulse/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AuthSessionSnapshot } from '../lib/auth-session';
import { AuthSessionProvider } from './auth-session-provider';
import {
  groupLiveChannels,
  LiveChannelsNav,
  readRailCollapsed,
} from './live-channels-nav';

function channel(
  id: string,
  overrides: Partial<LiveChannel> = {},
): LiveChannel {
  const room: VisibleRoom = {
    coverImageUrl: null,
    createdAt: '2026-10-09T15:30:00.000Z',
    description: 'A live conversation.',
    hostId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    id,
    likeCount: 12,
    status: 'LIVE',
    title: `Room ${id}`,
    updatedAt: '2026-10-09T15:30:00.000Z',
    version: 1,
  };
  return {
    room,
    host: {
      avatarUrl: null,
      id: room.hostId,
      name: 'Jamie',
    },
    following: false,
    ...overrides,
  };
}

const authenticated: AuthSessionSnapshot = {
  status: 'authenticated',
  user: {
    createdAt: '2026-10-09T15:30:00.000Z',
    email: 'viewer@example.com',
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    role: 'VIEWER',
    username: 'viewer',
  },
};

function renderNav(channels: LiveChannel[], session: AuthSessionSnapshot) {
  return renderToStaticMarkup(
    <AuthSessionProvider initialSession={session}>
      <LiveChannelsNav activeRoomId="popular-0" initialChannels={channels} />
    </AuthSessionProvider>,
  );
}

describe('LiveChannelsNav', () => {
  it('shows followed live rooms separately, without repeating them in Popular', () => {
    const followed = channel('followed', {
      following: true,
      host: {
        avatarUrl: 'https://example.com/jamie.png',
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'Jamie',
      },
    });
    const popular = channel('popular-0');
    const ended = channel('ended', {
      room: { ...channel('ended').room, status: 'ENDED' },
    });
    const markup = renderNav([followed, popular, ended], authenticated);

    expect(markup).toContain('aria-label="Following"');
    expect(markup).toContain('aria-label="Popular"');
    expect(markup).toContain('channel-group-divider');
    expect(markup).toContain('channel-avatar-following');
    expect(markup).toContain('src="https://example.com/jamie.png"');
    expect(markup.match(/href="\/rooms\/followed"/g)).toHaveLength(1);
    expect(markup).not.toContain('/rooms/ended');
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain('<aside');
  });

  it('hides Following for anonymous viewers and when nobody followed is live', () => {
    const followed = channel('followed', { following: true });
    expect(renderNav([followed], { status: 'anonymous' })).not.toContain(
      'aria-label="Following"',
    );
    expect(renderNav([followed], { status: 'anonymous' })).toContain(
      'aria-label="Popular"',
    );
    expect(renderNav([channel('popular-0')], authenticated)).not.toContain(
      'aria-label="Following"',
    );
    const ended = channel('ended', {
      room: { ...followed.room, id: 'ended', status: 'ENDED' },
    });
    expect(renderNav([ended], authenticated)).not.toContain(
      'aria-label="Popular"',
    );
  });

  it('shows eight popular rooms initially with a Show more control', () => {
    const channels = Array.from({ length: 10 }, (_, index) =>
      channel(`popular-${index}`),
    );
    const markup = renderNav(channels, { status: 'anonymous' });
    expect(markup).toContain('/rooms/popular-7');
    expect(markup).not.toContain('/rooms/popular-8');
    expect(markup).toContain('Show more');
    expect(
      renderNav(channels.slice(0, 8), { status: 'anonymous' }),
    ).not.toContain('Show more');
  });

  it('preserves accessible controls and the saved collapse choice', () => {
    const markup = renderNav([channel('popular-0')], authenticated);
    expect(markup).toContain('aria-label="Collapse live channels"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-label="Jamie: Room popular-0, live"');
    expect(readRailCollapsed('true')).toBe(true);
    expect(readRailCollapsed('false')).toBe(false);
    expect(readRailCollapsed(null)).toBe(false);
  });

  it('filters ended rooms before grouping', () => {
    const live = channel('live', { following: true });
    const ended = channel('ended', {
      following: true,
      room: { ...live.room, id: 'ended', status: 'ENDED' },
    });
    expect(groupLiveChannels([live, ended], true)).toEqual({
      following: [live],
      popular: [],
    });
  });
});
