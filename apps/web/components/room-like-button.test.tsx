import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RoomLikeButton } from './room-like-button';

const roomId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('RoomLikeButton', () => {
  it('offers sign-in while preserving the server-provided count', () => {
    const html = renderToStaticMarkup(
      createElement(RoomLikeButton, {
        authChecked: true,
        initialLikeCount: 5,
        roomId,
        userId: undefined,
      }),
    );

    expect(html).toContain('href="/auth"');
    expect(html).toContain('Sign in to like this room. 5 likes');
    expect(html).toContain('5 likes');
    expect(html).toContain('min-h-11');
  });

  it('disables mutation while authentication is loading', () => {
    const html = renderToStaticMarkup(
      createElement(RoomLikeButton, {
        authChecked: false,
        initialLikeCount: 0,
        roomId,
        userId: undefined,
      }),
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('0 likes');
  });

  it('wraps the count so changes can animate without a +1 before any like', () => {
    const html = renderToStaticMarkup(
      createElement(RoomLikeButton, {
        authChecked: false,
        initialLikeCount: 3,
        roomId,
        userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    );

    expect(html).toContain('class="like-count-change"');
    expect(html).not.toContain('like-plus');
    expect(html).not.toContain('like-heart-pop');
  });
});
