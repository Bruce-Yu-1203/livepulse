import { afterEach, describe, expect, it, vi } from 'vitest';

import { listRooms } from './api';

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
  });
});
