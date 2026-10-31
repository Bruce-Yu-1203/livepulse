import type { VisibleRoom } from '@livepulse/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthSessionProvider } from '../../../components/auth-session-provider';
import { getPublicUser, listRooms } from '../../../lib/api';
import PublicUserPage from './page';

vi.mock('../../../lib/api', () => ({
  listLiveChannels: vi.fn().mockResolvedValue([]),
  getPublicUser: vi.fn(),
  listRooms: vi.fn(),
}));

const userId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const room: VisibleRoom = {
  coverImageUrl: null,
  createdAt: '2026-10-09T15:30:00.000Z',
  description: 'A public broadcast.',
  hostId: userId,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  likeCount: 0,
  status: 'ENDED',
  title: 'Jazz in the evening',
  updatedAt: '2026-10-09T15:30:00.000Z',
  version: 1,
};

describe('PublicUserPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('shows the public profile and paginated visible broadcasts', async () => {
    vi.mocked(getPublicUser).mockResolvedValue({
      requestId: 'user-request',
      user: {
        avatarUrl: null,
        followerCount: 2,
        followingCount: 3,
        id: userId,
        joinedAt: '2026-10-01T00:00:00.000Z',
        name: 'Jamie Rivers',
        username: 'jamierivers',
      },
    });
    vi.mocked(listRooms).mockResolvedValue({
      items: [room],
      nextCursor: 'more-rooms',
      requestId: 'room-request',
    });

    const page = await PublicUserPage({
      params: Promise.resolve({ id: userId }),
      searchParams: Promise.resolve({ cursor: 'first-page' }),
    });
    const html = renderToStaticMarkup(
      <AuthSessionProvider initialSession={{ status: 'anonymous' }}>
        {page}
      </AuthSessionProvider>,
    );

    expect(getPublicUser).toHaveBeenCalledWith(userId);
    expect(listRooms).toHaveBeenCalledWith('first-page', undefined, userId);
    expect(html).toContain('Jamie Rivers');
    expect(html).toContain('3</strong> Following');
    expect(html).toContain('2</strong> Followers');
    expect(html).toContain(`/users/${userId}/following`);
    expect(html).toContain(`/users/${userId}/followers`);
    expect(html).toContain('@jamierivers');
    expect(html).toContain('Jazz in the evening');
    expect(html).toContain('cursor=more-rooms');
    expect(html).not.toContain('email');
  });
});
