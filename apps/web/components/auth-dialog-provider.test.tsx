import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthDialogProvider } from './auth-dialog-provider';
import { AuthSessionProvider } from './auth-session-provider';

describe('AuthDialogProvider', () => {
  it('renders a dormant dialog without loading the authentication form', () => {
    const markup = renderToStaticMarkup(
      <AuthSessionProvider initialSession={{ status: 'anonymous' }}>
        <AuthDialogProvider>
          <span>Current page stays visible</span>
        </AuthDialogProvider>
      </AuthSessionProvider>,
    );

    expect(markup).toContain('Current page stays visible');
    expect(markup).toContain('Sign in or create an account');
    expect(markup).not.toContain('Checking Google sign-in');
  });
});
