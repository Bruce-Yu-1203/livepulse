import type { ListRoomsResponse } from '@livepulse/contracts';
import Link from 'next/link';

import { HomeAccountAction } from '../components/home-account-action';
import { RoomCard } from '../components/room-card';
import { SiteHeader } from '../components/site-header';
import { listRooms } from '../lib/api';
import { summarizeRooms } from '../lib/presentation';
import { formatLikeCount } from '../lib/room-likes';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  let page: Pick<ListRoomsResponse, 'items' | 'nextCursor'> = {
    items: [],
    nextCursor: null,
  };
  let roomsUnavailable = false;

  try {
    page = await listRooms(cursor);
  } catch {
    roomsUnavailable = true;
  }

  const summary = summarizeRooms(page.items);
  const featuredRoom =
    page.items.find((room) => room.status === 'LIVE') ?? page.items[0];

  return (
    <>
      <SiteHeader />
      <main className="home-page">
        <section aria-labelledby="home-title" className="home-hero">
          <div className="home-hero-inner">
            <div className="home-intro">
              <p className="home-kicker">
                <span className="home-live-dot" /> The room is yours
              </p>
              <h1 id="home-title">
                Be there.
                <br />
                <span>While it happens.</span>
              </h1>
              <p className="home-description">
                Real voices, real reactions, all in the same moment. Find a room
                to watch, talk, and be part of what happens next.
              </p>
              <div className="home-actions">
                <a className="home-primary-action" href="#rooms">
                  Explore rooms <span aria-hidden="true">↗</span>
                </a>
                <HomeAccountAction />
              </div>
            </div>

            <div className="home-feature-wrap">
              <div className="home-feature-topline">
                <span>On the air</span>
                <span>
                  {roomsUnavailable
                    ? 'Waiting for rooms'
                    : `${String(summary.live).padStart(2, '0')} live now`}
                </span>
              </div>
              {featuredRoom ? (
                <Link
                  aria-label={`Featured room: ${featuredRoom.title}`}
                  className="home-feature"
                  href={`/rooms/${featuredRoom.id}`}
                >
                  {featuredRoom.coverImageUrl ? (
                    <img alt="" src={featuredRoom.coverImageUrl} />
                  ) : (
                    <SignalArtwork />
                  )}
                  <span className="home-feature-shade" />
                  <span className="home-feature-badge">
                    {featuredRoom.status === 'LIVE' ? 'Live now' : 'Replay'}
                  </span>
                  <span className="home-feature-caption">
                    <strong>{featuredRoom.title}</strong>
                    <span aria-hidden="true">↗</span>
                  </span>
                </Link>
              ) : (
                <div className="home-feature home-feature-empty">
                  <SignalArtwork />
                  <div className="home-feature-message">
                    <span>LivePulse</span>
                    <strong>Something good is coming on.</strong>
                  </div>
                </div>
              )}
              <div className="home-feature-bottomline">
                <span>Watch together, from anywhere</span>
                <span aria-hidden="true">✳</span>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Community activity" className="home-activity">
          <div className="home-activity-inner">
            <p>Made for being there together.</p>
            <dl>
              <div>
                <dt>Live rooms</dt>
                <dd>{roomsUnavailable ? '—' : summary.live}</dd>
              </div>
              <div>
                <dt>Past sessions</dt>
                <dd>{roomsUnavailable ? '—' : summary.replays}</dd>
              </div>
              <div>
                <dt>Room likes</dt>
                <dd>
                  {roomsUnavailable ? '—' : formatLikeCount(summary.likes)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section
          aria-labelledby="rooms-title"
          className="home-rooms"
          id="rooms"
        >
          <div className="home-section-heading">
            <div>
              <p className="home-section-label">Find your next room</p>
              <h2 id="rooms-title">What&apos;s happening</h2>
            </div>
            <p>
              Join a live conversation or catch up with a session that already
              ended.
            </p>
          </div>

          {roomsUnavailable ? (
            <div className="home-room-notice" role="status">
              <span aria-hidden="true" className="home-notice-mark">
                !
              </span>
              <div>
                <h3>Rooms are temporarily unavailable</h3>
                <p>
                  The room service isn&apos;t responding. Refresh this page in a
                  little while.
                </p>
              </div>
            </div>
          ) : page.items.length > 0 ? (
            <div className="home-room-grid">
              {page.items.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          ) : (
            <div className="home-room-notice">
              <span aria-hidden="true" className="home-notice-mark">
                ✳
              </span>
              <div>
                <h3>No rooms yet</h3>
                <p>
                  Live and past sessions will appear here when hosts publish
                  them.
                </p>
              </div>
            </div>
          )}

          {page.nextCursor ? (
            <div className="home-more">
              <Link
                href={{ pathname: '/', query: { cursor: page.nextCursor } }}
              >
                View more rooms
              </Link>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}

function SignalArtwork() {
  return (
    <div aria-hidden="true" className="signal-artwork">
      <span className="signal-orbit signal-orbit-one" />
      <span className="signal-orbit signal-orbit-two" />
      <span className="signal-orbit signal-orbit-three" />
      <span className="signal-core" />
    </div>
  );
}
