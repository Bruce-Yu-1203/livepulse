import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SiteSearch } from './site-search';

describe('SiteSearch', () => {
  it('renders a search form that submits to home', () => {
    const html = renderToStaticMarkup(<SiteSearch searchQuery="jazz" />);

    expect(html).toContain('role="search"');
    expect(html).toContain('action="/"');
    expect(html).toContain('name="q"');
    expect(html).toContain('value="jazz"');
    expect(html).toContain('aria-label="Search"');
  });

  it('keeps recent searches hidden until the field is focused', () => {
    const html = renderToStaticMarkup(<SiteSearch />);

    expect(html).not.toContain('Recent searches');
    expect(html).not.toContain('site-search-open');
  });
});
