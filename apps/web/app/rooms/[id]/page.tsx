import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LiveRoomExperience } from '../../../components/live-room-experience';
import { AppShell } from '../../../components/app-shell';
import { ApiRequestError, getRoom, listRooms } from '../../../lib/api';
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
    const [{ room }, channels] = await Promise.all([
      getRoom(id),
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
