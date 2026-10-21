import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthPanel, oauthErrorMessage } from './auth-panel.js';

describe('AuthPanel', () => {
  it('renders Google and email authentication choices', () => {
    const markup = renderToStaticMarkup(<AuthPanel />);

    expect(markup).toContain('Checking Google sign-in…');
    expect(markup).toContain(
      'Sign in to watch, chat, and pick up where you left off.',
    );
    expect(markup).toContain('or use email');
    expect(markup).toContain('current-password');
    expect(markup).toContain('for="auth-password"');
    expect(markup).toContain('id="auth-password"');
    expect(markup).toContain('Show password');
  });

  it('turns OAuth callback codes into useful feedback', () => {
    expect(oauthErrorMessage('access_denied')).toContain('cancelled');
    expect(oauthErrorMessage('account-not-linked')).toContain(
      'another sign-in method',
    );
    expect(oauthErrorMessage('provider_error')).toContain(
      'could not be completed',
    );
  });
});
