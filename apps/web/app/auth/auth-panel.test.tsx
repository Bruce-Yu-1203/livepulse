import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthPanel } from './auth-panel.js';

describe('AuthPanel', () => {
  it('renders Google and email authentication choices', () => {
    const markup = renderToStaticMarkup(<AuthPanel />);

    expect(markup).toContain('Checking Google sign-in…');
    expect(markup).toContain('or use email');
    expect(markup).toContain('current-password');
  });
});
