import type { VisibleRoom } from '@livepulse/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthSessionProvider } from '../components/auth-session-provider';
import { listRooms, searchSuggestions } from '../lib/api';
import HomePage from './page';

vi.mock('../lib/api', () => ({
  listLiveChannels: vi.fn().mockResolvedValue([]),
  listRooms: vi.fn(),
  searchSuggestions: vi.fn(),
}));

const room: VisibleRoom = {
  coverImageUrl: null,
  createdAt: '2026-10-09T15:30:00.000Z',
  description: 'A live conversation about making things together.',
  hostId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  likeCount: 24,
  status: 'LIVE',
  title: 'The Making Room',
  updatedAt: '2026-10-09T15:30:00.000Z',
  version: 1,
};

async function renderHome(cursor?: string, q?: string) {
  const page = await HomePage({
    searchParams: Promise.resolve({ cursor, q }),
  });
  return renderToStaticMarkup(
    <AuthSessionProvider initialSession={{ status: 'anonymous' }}>
      {page}
    </AuthSessionProvider>,
  );
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(searchSuggestions).mockResolvedValue({
      requestId: 'test-users',
      rooms: [],
      users: [],
    });
  });

  it('shows a featured room and the room list when the API responds', async () => {
    vi.mocked(listRooms).mockResolvedValue({
      items: [room],
      nextCursor: null,
      requestId: 'test-featured',
    });

    const html = await renderHome();

    expect(html).toContain('class="site-brand-mark"');
    expect(html).toContain('fill="#F0384F"');
    expect(html).toContain('role="search"');
    expect(html).toContain('aria-label="Live channels"');
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('Featured room: The Making Room');
    expect(html).toContain('Open The Making Room');
    expect(html).toContain('Live on LivePulse');
    expect(html).not.toContain('Recently ended');
    expect(html).not.toContain('Rooms are temporarily unavailable');
  });

  it('keeps the landing page usable when the room service is unavailable', async () => {
    vi.mocked(listRooms).mockRejectedValue(new Error('Connection refused'));

    const html = await renderHome();

    expect(html).toContain('Join LivePulse');
    expect(html).toContain('Rooms are temporarily unavailable');
    expect(html).toContain('home-room-notice-error');
    expect(html).not.toContain('aria-roledescription="carousel"');
    expect(html).not.toContain('No rooms yet');
  });

  it('shows an empty state only for a successful empty response', async () => {
    vi.mocked(listRooms).mockResolvedValue({
      items: [],
      nextCursor: null,
      requestId: 'test-empty',
    });

    const html = await renderHome();

    expect(html).toContain('No rooms yet');
    expect(html).not.toContain('home-room-notice-error');
    expect(html).not.toContain('Rooms are temporarily unavailable');
  });

  it('requests and renders a search page from the API', async () => {
    const otherRoom = {
      ...room,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      title: 'Night Market',
    };
    vi.mocked(listRooms).mockImplementation(async (_cursor, query) =>
      query
        ? { items: [room], nextCursor: 'next-page', requestId: 'test-search' }
        : {
            items: [room, otherRoom],
            nextCursor: null,
            requestId: 'test-channels',
          },
    );

    const html = await renderHome(undefined, '  making  ');

    expect(listRooms).toHaveBeenCalledWith(undefined, 'making');
    expect(listRooms).toHaveBeenCalledTimes(1);
    expect(html).toContain('Open The Making Room');
    expect(html).not.toContain('class="channel-name">Night Market');
    expect(html).not.toContain('Open Night Market');
    expect(html).toContain('Clear search');
    expect(html).toContain('cursor=next-page');
    expect(html).toContain('q=making');
    expect(html).not.toContain('aria-roledescription="carousel"');
  });

  it('shows matching users as links to public profiles', async () => {
    vi.mocked(listRooms).mockResolvedValue({
      items: [],
      nextCursor: null,
      requestId: 'test-empty-rooms',
    });
    vi.mocked(searchSuggestions).mockResolvedValue({
      requestId: 'test-matching-users',
      rooms: [],
      users: [
        {
          avatarUrl: null,
          id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
          name: 'Jamie Rivers',
          username: 'jamierivers',
        },
      ],
    });

    const html = await renderHome(undefined, 'jamie');

    expect(searchSuggestions).toHaveBeenCalledWith('jamie', 10);
    expect(html).toContain('Jamie Rivers');
    expect(html).toContain('/users/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(html).not.toContain('No matching users or rooms');
  });
});
