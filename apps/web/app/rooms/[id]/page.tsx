import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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
          <div className="mt-7 overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/40">
            <video
              className="aspect-video w-full bg-zinc-950 object-cover"
              controls
              poster={room.coverImageUrl}
              preload="metadata"
              src={room.demoVideoUrl}
            >
              Your browser does not support embedded video.
            </video>
          </div>

          <div className="grid gap-10 py-10 lg:grid-cols-[1fr_20rem] lg:py-14">
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

            <aside className="h-fit rounded-[1.5rem] border border-white/8 bg-white/[0.035] p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                Room access
              </p>
              <p className="mt-4 text-sm leading-6 text-zinc-300">
                {isLive
                  ? 'This room is live. Real-time chat will connect here in the next frontend milestone.'
                  : 'This broadcast has ended. The demo stream remains available as a replay.'}
              </p>
              <Link
                className="mt-6 block rounded-full bg-white px-5 py-3 text-center text-sm font-bold text-zinc-950 transition hover:bg-cyan-200"
                href="/auth"
              >
                Sign in to participate
              </Link>
            </aside>
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
