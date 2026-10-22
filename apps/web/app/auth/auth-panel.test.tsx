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
    expect(markup).toMatch(/for="_R_[^"]+"/);
    expect(markup).toContain('Show password');
    expect(markup).toContain('bg-sunken');
    expect(markup).toContain('text-fg');
  });

  it('can open directly in registration mode for the account dialog', () => {
    const markup = renderToStaticMarkup(<AuthPanel initialMode="register" />);

    expect(markup).toContain('Come join the conversation.');
    expect(markup).toContain('Start with the email address');
    expect(markup).not.toContain('new-password');
    expect(markup).toContain('Continue');
    expect(markup).toContain('data-active="true"');
    expect(markup).toContain('bg-accent');
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
