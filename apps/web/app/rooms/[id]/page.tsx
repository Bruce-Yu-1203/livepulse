import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LiveRoomExperience } from '../../../components/live-room-experience';
import { FollowButton } from '../../../components/follow-controls';
import { SearchUserAvatar } from '../../../components/search-user-card';
import { AppShell } from '../../../components/app-shell';
import {
  ApiRequestError,
  getPublicUser,
  getRoom,
  listRooms,
} from '../../../lib/api';
import { formatRoomDate, roomStatusLabel } from '../../../lib/presentation';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const { room } = await getRoom(id);
    return { description: room.description, title: room.title };
  } catch {
    return { title: 'Room' };
  }
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const { room } = await getRoom(id);
    const [{ user: host }, channels] = await Promise.all([
      getPublicUser(room.hostId),
      listRooms().then(
        (page) => page.items,
        () => [],
      ),
    ]);
    const isLive = room.status === 'LIVE';

    return (
      <AppShell activeRoomId={room.id} rooms={channels}>
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
          <Link
            className="text-sm text-muted transition hover:text-fg"
            href="/"
          >
            ← All rooms
          </Link>
          <LiveRoomExperience room={room} />

          <div className="py-10 lg:py-14">
            <section>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    isLive ? 'bg-danger text-on-accent' : 'bg-fg/8 text-fg-soft'
                  }`}
                >
                  {roomStatusLabel(room.status)}
                </span>
                <span className="text-sm text-muted">
                  Started {formatRoomDate(room.createdAt)}
                </span>
              </div>
              <h1 className="mt-6 text-4xl font-semibold tracking-[-0.045em] text-fg sm:text-6xl">
                {room.title}
              </h1>
              <div className="mt-7 flex flex-wrap items-center gap-4 rounded-2xl border border-fg/10 bg-surface px-5 py-4">
                <Link
                  className="flex min-w-0 items-center gap-3 hover:text-accent"
                  href={`/users/${host.id}`}
                >
                  <SearchUserAvatar user={host} />
                  <span className="min-w-0">
                    <strong className="block truncate text-base text-fg">
                      {host.name}
                    </strong>
                    <span className="block truncate text-sm text-muted">
                      {host.username ? `@${host.username}` : 'LivePulse host'}
                    </span>
                  </span>
                </Link>
                <div className="ml-auto">
                  <FollowButton userId={host.id} userName={host.name} />
                </div>
              </div>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-muted">
                {room.description}
              </p>
            </section>
          </div>
        </div>
      </AppShell>
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}
