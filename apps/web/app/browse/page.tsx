import type { Metadata } from 'next';

import { AppShell } from '../../components/app-shell';
import { CategoryTile } from '../../components/category-tile';
import { loadLiveChannels } from '../../components/live-channels-loader';
import { StatusNotice } from '../../components/status-notice';
import { listCategories } from '../../lib/api';
import { fallbackCategories } from '../../lib/categories';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Browse categories' };

export default async function BrowsePage() {
  const channelsRequest = loadLiveChannels();
  const result = await listCategories().catch(() => undefined);
  const channels = await channelsRequest;
  const categories = result?.items ?? fallbackCategories();

  return (
    <AppShell channels={channels}>
      <div className="browse-page">
        <h1 className="browse-title">Browse</h1>
        <p className="browse-lead">
          Categories with the most live rooms come first.
        </p>
        {result ? null : (
          <StatusNotice className="mt-4" tone="error">
            Live counts are temporarily unavailable.
          </StatusNotice>
        )}
        <div className="category-grid category-grid-wide">
          {categories.map((category) => (
            <CategoryTile category={category} key={category.slug} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
