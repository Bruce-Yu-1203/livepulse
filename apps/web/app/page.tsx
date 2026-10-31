import type {
  ListRoomsResponse,
  SearchUser,
  VisibleRoom,
} from '@livepulse/contracts';
import Link from 'next/link';

import { AppShell } from '../components/app-shell';
import { loadLiveChannels } from '../components/live-channels-loader';
import { BrandMark } from '../components/brand-mark';
import { FeaturedCarousel } from '../components/featured-carousel';
import { HomeAccountAction } from '../components/home-account-action';
import { RoomCard } from '../components/room-card';
import { SearchUserCard } from '../components/search-user-card';
import { StatusNotice } from '../components/status-notice';
import { listRooms, searchSuggestions } from '../lib/api';
import { selectFeaturedRooms } from '../lib/featured-carousel';
import { normalizeSearchQuery } from '../lib/presentation';

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
  let users: SearchUser[] = [];
  let roomsUnavailable = false;
  let usersUnavailable = false;

  // loadLiveChannels never rejects, so it can load alongside the rooms.
  const channelsRequest = loadLiveChannels();
  const [roomResult, userResult] = await Promise.allSettled([
    listRooms(cursor, searchQuery),
    searchQuery
      ? searchSuggestions(searchQuery, 10)
      : Promise.resolve(undefined),
  ]);
  const channels = await channelsRequest;
  if (roomResult.status === 'fulfilled') {
    page = roomResult.value;
  } else {
    roomsUnavailable = true;
  }
  if (userResult.status === 'fulfilled') {
    users = userResult.value?.users ?? [];
  } else {
    usersUnavailable = true;
  }

  const rooms = page.items;
  const liveRooms = rooms.filter((room) => room.status === 'LIVE');
  const endedRooms = rooms.filter((room) => room.status !== 'LIVE');

  return (
    <AppShell
      channels={channels}
      mainClassName="home-page"
      searchQuery={searchQuery}
    >
      {searchQuery || roomsUnavailable ? null : (
        <FeaturedCarousel rooms={selectFeaturedRooms(page.items)} />
      )}

      {searchQuery && (users.length > 0 || usersUnavailable) ? (
        <section aria-labelledby="users-title" className="home-users">
          <h2 className="home-shelf-title" id="users-title">
            Users
          </h2>
          {usersUnavailable ? (
            <StatusNotice className="mt-4" tone="error">
              User results are temporarily unavailable.
            </StatusNotice>
          ) : (
            <div className="home-user-grid">
              {users.map((user) => (
                <SearchUserCard key={user.id} user={user} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section aria-labelledby="rooms-title" className="home-rooms" id="rooms">
        <div className="home-section-heading">
          <div>
            {searchQuery ? (
              <p className="home-section-label">Search results · Rooms</p>
            ) : null}
            <h2 id="rooms-title">
              {searchQuery ? `“${searchQuery}”` : 'Browse rooms'}
            </h2>
          </div>
          {searchQuery ? (
            <p>
              {users.length} {users.length === 1 ? 'user' : 'users'} ·{' '}
              {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'} on this
              page. <Link href="/">Clear search</Link>
            </p>
          ) : (
            <HomeAccountAction />
          )}
        </div>

        {roomsUnavailable ? (
          <div
            className="home-room-notice home-room-notice-error"
            role="status"
          >
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
        ) : searchQuery && users.length > 0 ? null : (
          <div className="home-room-notice">
            <span aria-hidden="true" className="home-notice-mark">
              <BrandMark />
            </span>
            <div>
              <h3>
                {searchQuery ? 'No matching users or rooms' : 'No rooms yet'}
              </h3>
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
