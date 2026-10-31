import { findRoomCategory } from '@livepulse/contracts';
import type { ListRoomsResponse } from '@livepulse/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppShell } from '../../../components/app-shell';
import { CategoryCover } from '../../../components/category-cover';
import { loadLiveChannels } from '../../../components/live-channels-loader';
import { RoomCard } from '../../../components/room-card';
import { StatusNotice } from '../../../components/status-notice';
import { listRooms } from '../../../lib/api';
import {
  BROWSE_PATH,
  categoryHref,
  parseCategoryParam,
} from '../../../lib/categories';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: findRoomCategory(slug)?.name ?? 'Category' };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { slug } = await params;
  const { cursor } = await searchParams;
  const category = parseCategoryParam(slug);
  if (!category) notFound();
  const info = findRoomCategory(category);
  if (!info) notFound();

  const channelsRequest = loadLiveChannels();
  let page: Pick<ListRoomsResponse, 'items' | 'nextCursor'> | undefined;
  try {
    page = await listRooms(cursor, undefined, undefined, category);
  } catch {
    page = undefined;
  }
  const channels = await channelsRequest;
  const live = page?.items.filter((room) => room.status === 'LIVE') ?? [];
  const ended = page?.items.filter((room) => room.status !== 'LIVE') ?? [];

  return (
    <AppShell channels={channels}>
      <div className="browse-page">
        <nav aria-label="Breadcrumb" className="browse-crumb">
          <Link href={BROWSE_PATH}>Browse</Link> / {info.name}
        </nav>
        <header className="browse-header">
          <span className="browse-header-art">
            <CategoryCover category={category} />
          </span>
          <div>
            <h1 className="browse-title">{info.name}</h1>
            <p className="browse-lead">{info.description}</p>
            {page && !cursor ? (
              <p className="browse-header-stats">
                {live.length > 0 ? (
                  <span aria-hidden="true" className="channel-dot" />
                ) : null}
                <strong>{live.length}</strong> live now
              </p>
            ) : null}
          </div>
        </header>

        {!page ? (
          <StatusNotice className="mt-6" tone="error">
            Rooms are temporarily unavailable. Refresh this page in a little
            while.
          </StatusNotice>
        ) : page.items.length === 0 ? (
          <div className="home-room-notice mt-8">
            <div>
              <h3>No one is live in {info.name} right now</h3>
              <p>
                Rooms appear here as soon as a host goes live in this category.
              </p>
            </div>
          </div>
        ) : (
          <>
            {live.length > 0 ? (
              <section className="home-shelf mt-8">
                <h2 className="home-shelf-title">Live in {info.name}</h2>
                <div className="home-room-grid">
                  {live.map((room) => (
                    <RoomCard key={room.id} room={room} />
                  ))}
                </div>
              </section>
            ) : (
              <p className="mt-8 text-sm text-muted">
                No one is live in {info.name} right now.
              </p>
            )}
            {ended.length > 0 ? (
              <section className="home-shelf mt-12">
                <h2 className="home-shelf-title">Recently ended</h2>
                <div className="home-room-grid">
                  {ended.map((room) => (
                    <RoomCard key={room.id} room={room} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}

        {page?.nextCursor ? (
          <div className="home-more">
            <Link
              href={{
                pathname: categoryHref(category),
                query: { cursor: page.nextCursor },
              }}
            >
              View more rooms
            </Link>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
