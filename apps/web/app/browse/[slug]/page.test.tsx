import type { VisibleRoom } from '@livepulse/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthSessionProvider } from '../../../components/auth-session-provider';
import { listRooms } from '../../../lib/api';
import CategoryPage, { generateMetadata } from './page';

vi.mock('../../../lib/api', () => ({
  listLiveChannels: vi.fn().mockResolvedValue([]),
  listRooms: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const room: VisibleRoom = {
  category: 'irl',
  coverImageUrl: null,
  createdAt: '2026-10-09T15:30:00.000Z',
  description: 'Walking the back streets.',
  hostId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  likeCount: 3,
  status: 'LIVE',
  title: 'Tokyo night walk',
  updatedAt: '2026-10-09T15:30:00.000Z',
  version: 1,
};

async function renderCategory(slug: string, cursor?: string) {
  const page = await CategoryPage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({ cursor }),
  });
  return renderToStaticMarkup(
    <AuthSessionProvider initialSession={{ status: 'anonymous' }}>
      {page}
    </AuthSessionProvider>,
  );
}

describe('CategoryPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('shows live and ended rooms for the category', async () => {
    vi.mocked(listRooms).mockResolvedValue({
      items: [
        room,
        {
          ...room,
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          status: 'ENDED',
          title: 'Snow day in Sapporo',
        },
      ],
      nextCursor: 'next',
      requestId: 'irl',
    });

    const html = await renderCategory('irl');

    expect(listRooms).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      'irl',
    );
    expect(html).toContain('<h1 class="browse-title">IRL</h1>');
    expect(html).toContain('href="/browse"');
    expect(html).toContain('Live in IRL');
    expect(html).toContain('Open Tokyo night walk');
    expect(html).toContain('Recently ended');
    expect(html).toContain('<strong>1</strong> live now');
    expect(html).toContain('/browse/irl?cursor=next');
  });

  it('shows an empty state when the category has no rooms', async () => {
    vi.mocked(listRooms).mockResolvedValue({
      items: [],
      nextCursor: null,
      requestId: 'empty',
    });

    const html = await renderCategory('food');

    expect(html).toContain('No one is live in Food right now');
  });

  it('reports an unavailable room service', async () => {
    vi.mocked(listRooms).mockRejectedValue(new Error('offline'));

    const html = await renderCategory('music');

    expect(html).toContain('Rooms are temporarily unavailable');
  });

  it('returns not found for an unknown category', async () => {
    await expect(renderCategory('cooking')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(listRooms).not.toHaveBeenCalled();
  });

  it('names the page after the category', async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: 'gaming' }) }),
    ).resolves.toEqual({ title: 'Gaming' });
  });
});
