'use client';

import type { VisibleRoom } from '@livepulse/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  carouselNeighbors,
  featuredAutoplayMs,
  wrapIndex,
} from '../lib/featured-carousel';
import {
  formatRoomDate,
  avatarTone,
  roomMonogram,
  roomStatusLabel,
} from '../lib/presentation';
import { formatLikeCount } from '../lib/room-likes';
import { BrandMark } from './brand-mark';

type Direction = 'next' | 'previous';

export function FeaturedCarousel({ rooms }: { rooms: VisibleRoom[] }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<Direction>('next');
  const [paused, setPaused] = useState(false);
  const progressRef = useRef<HTMLSpanElement>(null);
  const position = wrapIndex(index, rooms.length);
  const current = rooms[position];
  const neighbors = carouselNeighbors(position, rooms.length);

  const show = useCallback(
    (target: number, towards: Direction) => {
      setDirection(towards);
      setIndex(wrapIndex(target, rooms.length));
    },
    [rooms.length],
  );

  // Auto-advance: the active dot fills over featuredAutoplayMs, then the next
  // room slides in. Hover, keyboard focus, a hidden tab or reduced motion stop it.
  useEffect(() => {
    if (!neighbors || paused) {
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let elapsed = 0;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      if (!document.hidden) {
        elapsed += delta;
      }
      const progress = Math.min(elapsed / featuredAutoplayMs, 1);
      progressRef.current?.style.setProperty('--progress', String(progress));
      if (progress >= 1) {
        show(position + 1, 'next');
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [neighbors, paused, position, show]);

  if (!current) {
    return null;
  }

  const upNext = neighbors ? rooms[neighbors.next] : undefined;

  return (
    <section
      aria-label="Featured rooms"
      aria-roledescription="carousel"
      className="featured"
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="featured-stage">
        {neighbors ? (
          <button
            aria-label="Previous featured room"
            className="featured-arrow featured-arrow-previous"
            onClick={() => show(position - 1, 'previous')}
            type="button"
          >
            <Chevron direction="previous" />
          </button>
        ) : null}

        <article
          aria-label={`${position + 1} of ${rooms.length}`}
          aria-roledescription="slide"
          className={`featured-slide featured-slide-${direction}`}
          key={current.id}
        >
          <Link
            aria-label={`Featured room: ${current.title}`}
            className="featured-media"
            href={`/rooms/${current.id}`}
          >
            {current.coverImageUrl ? (
              <img
                alt=""
                decoding="async"
                fetchPriority="high"
                height={720}
                loading="eager"
                src={current.coverImageUrl}
                width={1280}
              />
            ) : (
              <div aria-hidden="true" className="signal-artwork">
                <BrandMark className="signal-artwork-mark" />
              </div>
            )}
            <span
              className={`room-card-status ${current.status === 'LIVE' ? '' : 'room-card-status-ended'}`}
            >
              {roomStatusLabel(current.status)}
            </span>
          </Link>
          <div className="featured-info">
            <div className="featured-host">
              <span
                aria-hidden="true"
                className={`room-card-avatar avatar-tone-${avatarTone(current.title)}`}
              >
                {roomMonogram(current.title)}
              </span>
              <time dateTime={current.createdAt}>
                {formatRoomDate(current.createdAt)}
              </time>
            </div>
            <h2>{current.title}</h2>
            <p>{current.description}</p>
            <div className="featured-actions">
              <span className="featured-likes">
                {formatLikeCount(current.likeCount)} likes
              </span>
              <Link className="featured-watch" href={`/rooms/${current.id}`}>
                {current.status === 'LIVE' ? 'Watch live' : 'View room'}
              </Link>
            </div>
          </div>
        </article>

        {neighbors ? (
          <button
            aria-label="Next featured room"
            className="featured-arrow featured-arrow-next"
            onClick={() => show(position + 1, 'next')}
            type="button"
          >
            <Chevron direction="next" />
          </button>
        ) : null}
      </div>

      {neighbors ? (
        <div className="featured-pager">
          <div className="featured-dots">
            {rooms.map((room, dot) => (
              <button
                aria-current={dot === position ? 'true' : undefined}
                aria-label={`Show ${room.title}`}
                className="featured-dot"
                key={room.id}
                onClick={() => show(dot, dot >= position ? 'next' : 'previous')}
                type="button"
              >
                {dot === position ? (
                  <span className="featured-dot-progress" ref={progressRef} />
                ) : null}
              </button>
            ))}
          </div>
          {upNext ? (
            <p className="featured-next">
              <strong>{position + 1}</strong> / {rooms.length} · Up next:{' '}
              {upNext.title}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Chevron({ direction }: { direction: Direction }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d={direction === 'next' ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}
