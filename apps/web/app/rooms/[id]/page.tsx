import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LiveRoomExperience } from '../../../components/live-room-experience';
import { AppShell } from '../../../components/app-shell';
import {
  ApiRequestError,
  getPublicUser,
  getRoom,
  listLiveChannels,
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
      listLiveChannels(),
    ]);
    const isLive = room.status === 'LIVE';

    return (
      <AppShell activeRoomId={room.id} channels={channels}>
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
          <Link
            className="text-sm text-muted transition hover:text-fg"
            href="/"
          >
            ← All rooms
          </Link>
          <LiveRoomExperience host={host} initialNow={Date.now()} room={room} />

          <div className="py-6 lg:py-8">
            <section>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-md px-2 py-1 text-xs font-bold ${
                    isLive ? 'bg-live text-white' : 'bg-fg/8 text-fg-soft'
                  }`}
                >
                  {roomStatusLabel(room.status)}
                </span>
                <span className="text-sm text-muted">
                  Started {formatRoomDate(room.startedAt ?? room.createdAt)}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-[-0.02em] text-fg sm:text-3xl">
                {room.title}
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-muted">
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
