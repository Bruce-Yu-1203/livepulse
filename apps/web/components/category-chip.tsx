import type { RoomCategory } from '@livepulse/contracts';
import Link from 'next/link';

import { categoryHref, categoryName } from '../lib/categories';
import { CategoryIcon } from './category-icon';

/** A small category label; links to the category page unless `asText`. */
export function CategoryChip({
  asText = false,
  category,
}: {
  asText?: boolean;
  category: RoomCategory;
}) {
  const content = (
    <>
      <CategoryIcon category={category} />
      {categoryName(category)}
    </>
  );
  return asText ? (
    <span className="category-chip">{content}</span>
  ) : (
    <Link className="category-chip" href={categoryHref(category)}>
      {content}
    </Link>
  );
}
