'use client';

import type { VisibleRoom } from '@livepulse/contracts';
import Link from 'next/link';
import { useState } from 'react';

import { carouselNeighbors, wrapIndex } from '../lib/featured-carousel';
import { roomStatusLabel } from '../lib/presentation';
import { formatLikeCount } from '../lib/room-likes';
import { BrandMark } from './brand-mark';

export function FeaturedCarousel({ rooms }: { rooms: VisibleRoom[] }) {
  const [index, setIndex] = useState(0);
  const position = wrapIndex(index, rooms.length);
  const current = rooms[position];
  const neighbors = carouselNeighbors(position, rooms.length);

  if (!current) {
    return null;
  }

  const step = (offset: number) =>
    setIndex((value) => wrapIndex(value + offset, rooms.length));

  return (
    <section
      aria-label="Featured rooms"
      aria-roledescription="carousel"
      className="featured"
    >
      <div className="featured-stage">
        {neighbors ? (
          <>
            <Peek room={rooms[neighbors.previous]} side="left" />
            <Peek room={rooms[neighbors.next]} side="right" />
            <button
              aria-label="Previous featured room"
              className="featured-arrow featured-arrow-previous"
              onClick={() => step(-1)}
              type="button"
            >
              <Chevron direction="previous" />
            </button>
          </>
        ) : null}

        <article
          aria-label={`${position + 1} of ${rooms.length}`}
          aria-roledescription="slide"
          className="featured-slide"
          key={current.id}
        >
          <Link
            aria-label={`Featured room: ${current.title}`}
            className="featured-media"
            href={`/rooms/${current.id}`}
          >
            {current.coverImageUrl ? (
              <img alt="" src={current.coverImageUrl} />
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
            <h2>{current.title}</h2>
            <p>{current.description}</p>
            <span className="featured-likes">
              {formatLikeCount(current.likeCount)} likes
            </span>
          </div>
        </article>

        {neighbors ? (
          <button
            aria-label="Next featured room"
            className="featured-arrow featured-arrow-next"
            onClick={() => step(1)}
            type="button"
          >
            <Chevron direction="next" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Peek({
  room,
  side,
}: {
  room: VisibleRoom | undefined;
  side: 'left' | 'right';
}) {
  if (!room) {
    return null;
  }

  return (
    <div aria-hidden="true" className={`featured-peek featured-peek-${side}`}>
      {room.coverImageUrl ? (
        <img alt="" src={room.coverImageUrl} />
      ) : (
        <div className="signal-artwork" />
      )}
    </div>
  );
}

function Chevron({ direction }: { direction: 'next' | 'previous' }) {
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
