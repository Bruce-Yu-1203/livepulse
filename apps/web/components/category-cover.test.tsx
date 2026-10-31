import { roomCategorySlugs } from '@livepulse/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CategoryCover, categoryCoverMarkup } from './category-cover';
import { CategoryIcon } from './category-icon';

describe('category artwork', () => {
  it('draws a distinct cover and an icon for every category', () => {
    const covers = roomCategorySlugs.map(categoryCoverMarkup);
    expect(new Set(covers).size).toBe(roomCategorySlugs.length);
    for (const slug of roomCategorySlugs) {
      expect(categoryCoverMarkup(slug)).toMatch(/^<rect width="400"/);
      expect(renderToStaticMarkup(<CategoryIcon category={slug} />)).toContain(
        '<path',
      );
    }
  });

  it('renders the cover as decorative, cropped artwork', () => {
    const html = renderToStaticMarkup(<CategoryCover category="irl" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(html).toContain('viewBox="0 0 400 300"');
  });
});
