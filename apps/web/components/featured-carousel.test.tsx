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
    expect(markup).toContain('Watch live');
    expect(markup).toContain('class="featured-watch" href="/rooms/one"');
  });

  it('shows a pager with one dot per room and names the next room', () => {
    const markup = renderToStaticMarkup(
      <FeaturedCarousel
        rooms={[
          room('one', 'First'),
          room('two', 'Second'),
          room('three', 'Third'),
        ]}
      />,
    );

    expect(markup).toContain('aria-label="Show First"');
    expect(markup).toContain('aria-label="Show Third"');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('featured-dot-progress');
    expect(markup).toMatch(/Up next:(?: |<!-- -->)+Second/);
    expect(markup).toContain('featured-slide-next');
  });

  it('hides navigation when only one room is featured', () => {
    const markup = renderToStaticMarkup(
      <FeaturedCarousel rooms={[room('one', 'First')]} />,
    );

    expect(markup).not.toContain('Next featured room');
    expect(markup).not.toContain('featured-pager');
  });

  it('loads only the visible cover, at full priority and 16:9 size', () => {
    const markup = renderToStaticMarkup(
      <FeaturedCarousel
        rooms={[
          {
            ...room('one', 'First'),
            coverImageUrl: 'https://cdn.example.com/one.jpg',
          },
          {
            ...room('two', 'Second'),
            coverImageUrl: 'https://cdn.example.com/two.jpg',
          },
        ]}
      />,
    );

    expect(markup).toContain('fetchPriority="high"');
    expect(markup).toContain('loading="eager"');
    expect(markup).toContain('width="1280"');
    expect(markup).toContain('height="720"');
    expect(markup).not.toContain('two.jpg');
  });

  it('uses an accurate destination label for ended rooms', () => {
    const markup = renderToStaticMarkup(
      <FeaturedCarousel
        rooms={[{ ...room('ended', 'Archive'), status: 'ENDED' }]}
      />,
    );

    expect(markup).toContain('View room');
    expect(markup).not.toContain('Watch live');
    expect(markup).not.toContain('View replay');
  });

  it('renders nothing without rooms', () => {
    expect(renderToStaticMarkup(<FeaturedCarousel rooms={[]} />)).toBe('');
  });
});
