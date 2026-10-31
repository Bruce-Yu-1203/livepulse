import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthSessionProvider } from '../components/auth-session-provider';
import RoomLoading from './rooms/[id]/loading';
import ProfileLoading from './users/[id]/loading';

function renderLoading(element: ReactNode) {
  return renderToStaticMarkup(
    <AuthSessionProvider initialSession={{ status: 'anonymous' }}>
      {element}
    </AuthSessionProvider>,
  );
}

describe('route loading layouts', () => {
  it('reserves the room stage, chat and broadcaster areas', () => {
    const html = renderLoading(<RoomLoading />);

    expect(html).toContain('Loading room…');
    expect(html).toContain('class="app-shell"');
    expect(html).toContain('aspect-video min-h-64');
    expect(html).toContain('min-h-[30rem]');
    expect(html).toContain('size-16 shrink-0 rounded-full');
  });

  it('reserves the profile header and broadcast grid', () => {
    const html = renderLoading(<ProfileLoading />);

    expect(html).toContain('Loading profile…');
    expect(html).toContain('size-24 shrink-0 rounded-full');
    expect(html).toContain('class="home-room-grid"');
    expect(html.match(/aspect-video rounded-lg/g)).toHaveLength(3);
  });
});
