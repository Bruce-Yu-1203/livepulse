import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LiveRoomExperience } from '../../../components/live-room-experience';
import { SiteHeader } from '../../../components/site-header';
import { ApiRequestError, getRoom } from '../../../lib/api';
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
    const isLive = room.status === 'LIVE';

    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-16">
          <Link
            className="text-sm text-zinc-500 transition hover:text-white"
            href="/"
          >
            ← All rooms
          </Link>
          <LiveRoomExperience room={room} />

          <div className="py-10 lg:py-14">
            <section>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] ${
                    isLive
                      ? 'bg-rose-500 text-white'
                      : 'bg-white/8 text-zinc-300'
                  }`}
                >
                  {roomStatusLabel(room.status)}
                </span>
                <span className="text-sm text-zinc-500">
                  Started {formatRoomDate(room.createdAt)}
                </span>
              </div>
              <h1 className="mt-6 text-4xl font-semibold tracking-[-0.045em] text-white sm:text-6xl">
                {room.title}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-zinc-400">
                {room.description}
              </p>
            </section>
          </div>
        </main>
      </>
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}
