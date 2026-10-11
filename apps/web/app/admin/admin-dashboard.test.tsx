import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminDashboard } from './admin-dashboard';

describe('AdminDashboard', () => {
  it('renders a non-sensitive loading shell before authorization resolves', () => {
    const html = renderToStaticMarkup(createElement(AdminDashboard));

    expect(html).toContain('Preparing the moderation queue');
    expect(html).not.toContain('Remove message');
  });
});
