import type { CategorySummary } from '@livepulse/contracts';
import Link from 'next/link';

import { categoryHref } from '../lib/categories';
import { CategoryCover } from './category-cover';

export function CategoryTile({ category }: { category: CategorySummary }) {
  const live = category.liveCount > 0;
  return (
    <Link
      aria-label={`${category.name}: ${live ? `${category.liveCount} live` : 'no one live'}`}
      className="category-tile"
      data-live={live}
      href={categoryHref(category.slug)}
    >
      <span className="category-tile-art">
        <CategoryCover category={category.slug} />
        {live ? (
          <span className="category-tile-live">
            <span aria-hidden="true" className="channel-dot" />
            {category.liveCount} live
          </span>
        ) : null}
      </span>
      <span className="category-tile-name">{category.name}</span>
      <span className="category-tile-meta">
        {live
          ? `${category.liveCount} ${category.liveCount === 1 ? 'room' : 'rooms'} live`
          : 'No one live'}
      </span>
    </Link>
  );
}
