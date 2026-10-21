import type { ListRoomsResponse, VisibleRoom } from '@livepulse/contracts';
import Link from 'next/link';

import { AppShell } from '../components/app-shell';
import { BrandMark } from '../components/brand-mark';
import { FeaturedCarousel } from '../components/featured-carousel';
import { HomeAccountAction } from '../components/home-account-action';
import { RoomCard } from '../components/room-card';
import { listRooms } from '../lib/api';
import { selectFeaturedRooms } from '../lib/featured-carousel';
import { filterRooms, normalizeSearchQuery } from '../lib/presentation';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; q?: string }>;
}) {
  const { cursor, q } = await searchParams;
  const searchQuery = normalizeSearchQuery(q);
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

  const rooms = filterRooms(page.items, searchQuery);
  const liveRooms = rooms.filter((room) => room.status === 'LIVE');
  const endedRooms = rooms.filter((room) => room.status !== 'LIVE');

  return (
    <AppShell
      mainClassName="home-page"
      rooms={page.items}
      searchQuery={searchQuery}
    >
      {searchQuery || roomsUnavailable ? null : (
        <FeaturedCarousel rooms={selectFeaturedRooms(page.items)} />
      )}

      <section aria-labelledby="rooms-title" className="home-rooms" id="rooms">
        <div className="home-section-heading">
          <div>
            <p className="home-section-label">
              {searchQuery ? 'Search results' : 'Find your next room'}
            </p>
            <h2 id="rooms-title">
              {searchQuery ? `“${searchQuery}”` : "What's happening"}
            </h2>
          </div>
          {searchQuery ? (
            <p>
              {rooms.length === 1 ? '1 room' : `${rooms.length} rooms`} on this
              page match. <Link href="/">Clear search</Link>
            </p>
          ) : (
            <HomeAccountAction />
          )}
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
        ) : rooms.length > 0 ? (
          <>
            <RoomShelf rooms={liveRooms} title="Live on LivePulse" />
            <RoomShelf rooms={endedRooms} title="Recently ended" />
          </>
        ) : (
          <div className="home-room-notice">
            <span aria-hidden="true" className="home-notice-mark">
              <BrandMark />
            </span>
            <div>
              <h3>{searchQuery ? 'No matching rooms' : 'No rooms yet'}</h3>
              <p>
                {searchQuery
                  ? 'Try another word, or clear the search to see every room.'
                  : 'Live and past sessions will appear here when hosts publish them.'}
              </p>
            </div>
          </div>
        )}

        {page.nextCursor ? (
          <div className="home-more">
            <Link
              href={{
                pathname: '/',
                query: {
                  cursor: page.nextCursor,
                  ...(searchQuery ? { q: searchQuery } : {}),
                },
              }}
            >
              View more rooms
            </Link>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function RoomShelf({ rooms, title }: { rooms: VisibleRoom[]; title: string }) {
  if (rooms.length === 0) {
    return null;
  }

  return (
    <section className="home-shelf">
      <h3 className="home-shelf-title">{title}</h3>
      <div className="home-room-grid">
        {rooms.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>
    </section>
  );
}
