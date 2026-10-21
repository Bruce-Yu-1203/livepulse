import type { VisibleRoom } from '@livepulse/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FeaturedCarousel } from './featured-carousel';

function room(id: string, title: string): VisibleRoom {
  return {
    coverImageUrl: null,
    createdAt: '2026-10-09T15:30:00.000Z',
    description: `${title} description`,
    hostId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    id,
    likeCount: 3,
    status: 'LIVE',
    title,
    updatedAt: '2026-10-09T15:30:00.000Z',
    version: 1,
  };
}

describe('FeaturedCarousel', () => {
  it('features the first room with a watch link that does not reuse card link names', () => {
    const markup = renderToStaticMarkup(
      <FeaturedCarousel
        rooms={[room('one', 'First'), room('two', 'Second')]}
      />,
    );

    expect(markup).toContain('aria-roledescription="carousel"');
    expect(markup).toContain('aria-label="Featured room: First"');
    expect(markup).toContain('aria-roledescription="slide"');
    expect(markup).toContain('href="/rooms/one"');
    expect(markup).toContain('1 of 2');
    expect(markup).toContain('Previous featured room');
    expect(markup).toContain('Next featured room');
  });

  it('hides navigation when only one room is featured', () => {
    const markup = renderToStaticMarkup(
      <FeaturedCarousel rooms={[room('one', 'First')]} />,
    );

    expect(markup).not.toContain('Next featured room');
  });

  it('renders nothing without rooms', () => {
    expect(renderToStaticMarkup(<FeaturedCarousel rooms={[]} />)).toBe('');
  });
});
