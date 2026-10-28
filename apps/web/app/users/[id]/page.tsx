import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppShell } from '../../../components/app-shell';
import { ProfileFollowControls } from '../../../components/follow-controls';
import { RoomCard } from '../../../components/room-card';
import { SearchUserAvatar } from '../../../components/search-user-card';
import { ApiRequestError, getPublicUser, listRooms } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const { user } = await getPublicUser(id);
    return { title: user.username ? `@${user.username}` : user.name };
  } catch {
    return { title: 'Member' };
  }
}

export default async function PublicUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { id } = await params;
  const { cursor } = await searchParams;
  try {
    const { user } = await getPublicUser(id);
    const roomPage = await listRooms(cursor, undefined, id);
    return (
      <AppShell rooms={roomPage.items}>
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
          <Link
            className="text-sm text-muted transition hover:text-fg"
            href="/"
          >
            ← Discover
          </Link>
          <section className="mt-10 flex flex-wrap items-center gap-6 rounded-[2rem] border border-fg/8 bg-surface p-6 sm:p-9">
            <SearchUserAvatar
              className="profile-avatar"
              loading="eager"
              user={user}
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-accent">
                LivePulse member
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-fg sm:text-5xl">
                {user.name}
              </h1>
              {user.username ? (
                <p className="mt-2 text-lg text-muted">@{user.username}</p>
              ) : null}
              <p className="mt-3 text-sm text-subtle">
                Joined {new Date(user.joinedAt).toLocaleDateString('en-CA')}
              </p>
              <ProfileFollowControls
                followerCount={user.followerCount}
                followingCount={user.followingCount}
                userId={user.id}
                userName={user.name}
              />
            </div>
          </section>
          <section className="mt-12" aria-labelledby="member-rooms-title">
            <h2
              className="text-2xl font-semibold tracking-[-0.03em] text-fg"
              id="member-rooms-title"
            >
              Broadcasts
            </h2>
            {roomPage.items.length > 0 ? (
              <div className="home-room-grid">
                {roomPage.items.map((room) => (
                  <RoomCard key={room.id} room={room} />
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-2xl border border-dashed border-fg/10 bg-surface px-6 py-8 text-sm text-muted">
                No public broadcasts yet.
              </p>
            )}
            {roomPage.nextCursor ? (
              <div className="home-more">
                <Link
                  href={{
                    pathname: `/users/${user.id}`,
                    query: { cursor: roomPage.nextCursor },
                  }}
                >
                  View more broadcasts
                </Link>
              </div>
            ) : null}
          </section>
        </div>
      </AppShell>
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
}
