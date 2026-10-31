import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthSessionProvider } from '../../components/auth-session-provider';
import { listCategories } from '../../lib/api';
import BrowsePage from './page';

vi.mock('../../lib/api', () => ({
  listCategories: vi.fn(),
  listLiveChannels: vi.fn().mockResolvedValue([]),
}));

async function renderBrowse() {
  const page = await BrowsePage();
  return renderToStaticMarkup(
    <AuthSessionProvider initialSession={{ status: 'anonymous' }}>
      {page}
    </AuthSessionProvider>,
  );
}

describe('BrowsePage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('lists categories in the order the API ranks them, with covers', async () => {
    vi.mocked(listCategories).mockResolvedValue({
      items: [
        { description: 'Games.', liveCount: 4, name: 'Gaming', slug: 'gaming' },
        { description: 'Food.', liveCount: 0, name: 'Food', slug: 'food' },
      ],
      requestId: 'browse',
    });

    const html = await renderBrowse();

    expect(html).toContain('<h1 class="browse-title">Browse</h1>');
    expect(html.indexOf('/browse/gaming')).toBeLessThan(
      html.indexOf('/browse/food'),
    );
    expect(html).toContain('4 rooms live');
    expect(html).toContain('No one live');
    expect(html).toContain('data-live="false"');
    expect(html).toContain('class="category-cover"');
    expect(html).not.toContain('Live counts are temporarily unavailable');
  });

  it('still lists every category when live counts fail to load', async () => {
    vi.mocked(listCategories).mockRejectedValue(new Error('offline'));

    const html = await renderBrowse();

    expect(html).toContain('Live counts are temporarily unavailable');
    expect(html.match(/class="category-tile"/g)).toHaveLength(9);
  });
});
