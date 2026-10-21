import type { VisibleRoom } from '@livepulse/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthSessionProvider } from '../components/auth-session-provider';
import { listRooms } from '../lib/api';
import HomePage from './page';

vi.mock('../lib/api', () => ({ listRooms: vi.fn() }));

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

async function renderHome(cursor?: string) {
  const page = await HomePage({ searchParams: Promise.resolve({ cursor }) });
  return renderToStaticMarkup(
    <AuthSessionProvider initialSession={{ status: 'anonymous' }}>
      {page}
    </AuthSessionProvider>,
  );
}

describe('HomePage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('shows a featured room and the room list when the API responds', async () => {
    vi.mocked(listRooms).mockResolvedValue({
      items: [room],
      nextCursor: null,
      requestId: 'test-featured',
    });

    const html = await renderHome();

    expect(html).toContain('Be there.');
    expect(html).toContain('class="site-brand-mark"');
    expect(html).toContain('fill="#FF4961"');
    expect(html).toContain('Featured room: The Making Room');
    expect(html).toContain('Open The Making Room');
    expect(html).toContain('1 live now');
    expect(html).not.toContain('Rooms are temporarily unavailable');
  });

  it('keeps the landing page usable when the room service is unavailable', async () => {
    vi.mocked(listRooms).mockRejectedValue(new Error('Connection refused'));

    const html = await renderHome();

    expect(html).toContain('Explore rooms');
    expect(html).toContain('Join LivePulse');
    expect(html).toContain('Rooms are temporarily unavailable');
    expect(html).toContain('Waiting for rooms');
    expect(html).not.toContain('00 live now');
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
    expect(html).not.toContain('Rooms are temporarily unavailable');
  });
});
