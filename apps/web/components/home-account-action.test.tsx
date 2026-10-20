import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AuthSessionSnapshot } from '../lib/auth-session';
import { AuthSessionProvider } from './auth-session-provider';
import { HomeAccountAction } from './home-account-action';

function renderAction(session: AuthSessionSnapshot) {
  return renderToStaticMarkup(
    <AuthSessionProvider initialSession={session}>
      <HomeAccountAction />
    </AuthSessionProvider>,
  );
}

describe('HomeAccountAction', () => {
  it('invites anonymous visitors to sign in', () => {
    expect(renderAction({ status: 'anonymous' })).toContain('Join LivePulse');
  });

  it('sends hosts to their studio instead of showing a sign-in action', () => {
    const markup = renderAction({
      status: 'authenticated',
      user: {
        createdAt: '2026-10-19T12:00:00.000Z',
        email: 'host@example.com',
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        role: 'HOST',
      },
    });

    expect(markup).toContain('Open Studio');
    expect(markup).toContain('href="/studio"');
    expect(markup).not.toContain('Join LivePulse');
  });
});
