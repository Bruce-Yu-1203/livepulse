import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthSessionProvider } from '../../components/auth-session-provider';
import AuthPage from './page';

describe('AuthPage', () => {
  it('gives visitors a clear route back to rooms and a sign-in form', () => {
    const html = renderToStaticMarkup(
      <AuthSessionProvider initialSession={{ status: 'anonymous' }}>
        <AuthPage />
      </AuthSessionProvider>,
    );

    expect(html).toContain('Back to rooms');
    expect(html).toContain('livepulse');
    expect(html).toContain('fill="#F0384F"');
    expect(html).toContain('Every good room starts with people showing up.');
    expect(html).toContain('Welcome back to the room.');
    expect(html).toContain('Sign in');
  });
});
