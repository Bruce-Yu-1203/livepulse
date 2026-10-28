import type { SearchUser } from '@livepulse/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SearchUserAvatar, SearchUserCard } from './search-user-card';

const user: SearchUser = {
  avatarUrl: 'https://api.example.com/avatar.jpg',
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  name: 'Jamie Rivers',
  username: 'jamierivers',
};

describe('SearchUserAvatar', () => {
  it('defers list avatars and reserves a square image', () => {
    const html = renderToStaticMarkup(<SearchUserCard user={user} />);

    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('width="96"');
    expect(html).toContain('height="96"');
  });

  it('can load a visible profile avatar immediately', () => {
    const html = renderToStaticMarkup(
      <SearchUserAvatar loading="eager" user={user} />,
    );

    expect(html).toContain('loading="eager"');
  });
});
