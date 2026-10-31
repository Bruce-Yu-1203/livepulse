import { afterEach, describe, expect, it, vi } from 'vitest';

import { listCategories, listLiveChannels, listRooms } from './api';

describe('listRooms', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('passes the search query and cursor to the rooms API', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ items: [], nextCursor: null, requestId: 'search' }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await listRooms('next-page', 'street food');

    const url = fetchMock.mock.calls[0]?.[0];
    expect(url).toBeInstanceOf(URL);
    if (!(url instanceof URL)) return;
    expect(url.pathname).toBe('/api/v1/rooms');
    expect(url.searchParams.get('limit')).toBe('12');
    expect(url.searchParams.get('cursor')).toBe('next-page');
    expect(url.searchParams.get('q')).toBe('street food');
    expect(url.searchParams.has('category')).toBe(false);
  });

  it('filters by category when one is given', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ items: [], nextCursor: null, requestId: 'cat' }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await listRooms(undefined, undefined, undefined, 'irl');

    const url = fetchMock.mock.calls[0]?.[0];
    expect(url instanceof URL ? url.searchParams.get('category') : null).toBe(
      'irl',
    );
  });
});

describe('listCategories', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads category summaries from the API', async () => {
    const body = {
      items: [
        {
          description: 'Out in the world.',
          liveCount: 2,
          name: 'IRL',
          slug: 'irl',
        },
      ],
      requestId: 'categories',
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listCategories()).resolves.toEqual(body);
    const url = fetchMock.mock.calls[0]?.[0];
    expect(url instanceof URL ? url.pathname : url).toBe('/api/v1/categories');
  });
});

describe('listLiveChannels', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('forwards the viewer cookie so followed hosts are grouped', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [], requestId: 'live' }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listLiveChannels('better-auth.session_token=abc'),
    ).resolves.toEqual([]);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url instanceof URL ? url.pathname : url).toBe(
      '/api/v1/live-channels',
    );
    expect(init?.headers).toMatchObject({
      cookie: 'better-auth.session_token=abc',
    });
  });

  it('returns an empty list when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    );
    await expect(listLiveChannels()).resolves.toEqual([]);
  });
});
