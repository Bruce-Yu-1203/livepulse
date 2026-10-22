import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthSessionProvider } from './auth-session-provider';
import { SiteHeader } from './site-header';

function renderHeader(searchQuery?: string) {
  return renderToStaticMarkup(
    <AuthSessionProvider initialSession={{ status: 'anonymous' }}>
      <SiteHeader searchQuery={searchQuery} />
    </AuthSessionProvider>,
  );
}

describe('SiteHeader', () => {
  it('offers discover navigation and a room search that submits to home', () => {
    const markup = renderHeader();

    expect(markup).toContain('Discover');
    expect(markup).toContain('role="search"');
    expect(markup).toContain('action="/"');
    expect(markup).toContain('name="q"');
    expect(markup).toContain('Search rooms');
  });

  it('offers a light and dark mode switch', () => {
    expect(renderHeader()).toContain(
      'aria-label="Switch between light and dark mode"',
    );
  });

  it('keeps the current search in the input', () => {
    expect(renderHeader('design')).toContain('value="design"');
  });
});
