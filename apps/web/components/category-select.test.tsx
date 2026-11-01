import { roomCategories } from '@livepulse/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CategorySelect } from './category-select';

describe('CategorySelect', () => {
  it('lists every category and marks the current one', () => {
    const markup = renderToStaticMarkup(
      <CategorySelect disabled={false} onChange={vi.fn()} value="music" />,
    );

    expect(markup).toContain('Category');
    for (const category of roomCategories) {
      expect(markup).toContain(`value="${category.slug}"`);
    }
    expect(markup).toContain('<option value="music" selected="">');
  });

  it('can be disabled while a change is saving', () => {
    const markup = renderToStaticMarkup(
      <CategorySelect disabled onChange={vi.fn()} value="music" />,
    );

    expect(markup).toContain('disabled=""');
  });
});
