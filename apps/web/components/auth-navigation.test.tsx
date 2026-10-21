import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AuthSessionSnapshot } from '../lib/auth-session';
import { AuthNavigation } from './auth-navigation';
import { AuthSessionProvider } from './auth-session-provider';

const adminSession: AuthSessionSnapshot = {
  status: 'authenticated',
  user: {
    createdAt: '2026-10-19T12:00:00.000Z',
    email: 'bruce.yu@example.com',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    role: 'ADMIN',
  },
};

function renderNavigation(session: AuthSessionSnapshot) {
  return renderToStaticMarkup(
    <AuthSessionProvider initialSession={session}>
      <AuthNavigation />
    </AuthSessionProvider>,
  );
}

describe('AuthNavigation', () => {
  it('shows sign in only for anonymous visitors', () => {
    const markup = renderNavigation({ status: 'anonymous' });

    expect(markup).toContain('Sign in');
    expect(markup).toContain('href="/auth"');
    expect(markup).toContain('site-signin');
  });

  it('replaces sign in with the account and role navigation after login', () => {
    const markup = renderNavigation(adminSession);

    expect(markup).not.toContain('Sign in');
    expect(markup).toContain('Bruce Yu');
    expect(markup).toContain('Moderation');
    expect(markup).toContain('Studio');
    expect(markup).toContain('Sign out');
  });

  it('uses a stable placeholder while the session is loading', () => {
    expect(renderNavigation({ status: 'loading' })).toContain(
      'Checking your session',
    );
  });
});
