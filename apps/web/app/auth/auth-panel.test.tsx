import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ClientApiError } from '../../lib/client-api.js';
import {
  AuthPanel,
  oauthErrorMessage,
  requiresLoginVerification,
} from './auth-panel.js';
import { RegistrationTurnstile } from './registration-turnstile.js';

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

  it('provides a named container for the registration challenge', () => {
    const markup = renderToStaticMarkup(
      <RegistrationTurnstile onToken={() => undefined} resetKey={0} />,
    );

    expect(markup).toContain('aria-label="Human verification"');
  });

  it('shows the login challenge only for its dedicated API response', () => {
    expect(
      requiresLoginVerification(
        new ClientApiError(
          'Complete human verification',
          429,
          'AUTH_LOGIN_VERIFICATION_REQUIRED',
        ),
      ),
    ).toBe(true);
    expect(
      requiresLoginVerification(
        new ClientApiError('Too many requests', 429, 'REQUEST_RATE_LIMITED'),
      ),
    ).toBe(false);
    expect(
      renderToStaticMarkup(
        <RegistrationTurnstile
          action="login"
          onToken={() => undefined}
          resetKey={0}
        />,
      ),
    ).toContain('aria-label="Human verification"');
  });
});
