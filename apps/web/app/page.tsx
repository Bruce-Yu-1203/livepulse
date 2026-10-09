import Link from 'next/link';

import { RoomCard } from '../components/room-card';
import { SiteHeader } from '../components/site-header';
import { listRooms } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;

  try {
    const page = await listRooms(cursor);

    return (
      <>
        <SiteHeader />
        <main>
          <section className="relative isolate overflow-hidden border-b border-white/8">
            <div className="absolute left-1/2 top-[-26rem] -z-10 h-[48rem] w-[48rem] -translate-x-1/2 rounded-full border border-cyan-300/10 bg-cyan-300/[0.045] blur-3xl" />
            <div className="mx-auto max-w-7xl px-5 pb-20 pt-24 sm:px-8 sm:pb-28 sm:pt-32">
              <div className="max-w-4xl">
                <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
                  <span className="h-px w-8 bg-cyan-300/70" />
                  Shared moments, happening now
                </p>
                <h1 className="mt-7 text-5xl font-semibold leading-[0.96] tracking-[-0.06em] text-white sm:text-7xl lg:text-[6.5rem]">
                  Live rooms with a pulse.
                </h1>
                <p className="mt-7 max-w-2xl text-base leading-8 text-zinc-400 sm:text-lg">
                  Step into live conversations, learn alongside a crowd, and
                  return to the moments worth replaying.
                </p>
                <div className="mt-10 flex flex-wrap gap-3">
                  <a
                    className="rounded-full bg-cyan-300 px-6 py-3 font-bold text-zinc-950 transition hover:bg-cyan-200"
                    href="#rooms"
                  >
                    Explore rooms
                  </a>
                  <Link
                    className="rounded-full border border-white/12 px-6 py-3 font-semibold text-white transition hover:border-white/25 hover:bg-white/5"
                    href="/auth"
                  >
                    Join LivePulse
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section
            className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24"
            id="rooms"
          >
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                  Discover
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                  Rooms for curious people
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-zinc-500">
                Live broadcasts appear beside completed sessions, so the room
                never disappears when the stream ends.
              </p>
            </div>

            {page.items.length > 0 ? (
              <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {page.items.map((room) => (
                  <RoomCard key={room.id} room={room} />
                ))}
              </div>
            ) : (
              <div className="mt-10 rounded-[2rem] border border-dashed border-white/12 bg-white/[0.025] px-6 py-20 text-center">
                <p className="text-lg font-semibold text-white">
                  The stage is quiet for a moment.
                </p>
                <p className="mt-2 text-sm text-zinc-500">
                  Live and replay rooms will appear here as hosts publish them.
                </p>
              </div>
            )}

            {page.nextCursor ? (
              <div className="mt-12 flex justify-center">
                <Link
                  className="rounded-full border border-white/12 px-6 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:text-cyan-200"
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
  } catch {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-5 py-20 text-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-300">
              Connection interrupted
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white">
              Rooms are temporarily out of reach.
            </h1>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-zinc-400">
              Start the LivePulse API and refresh this page. The interface is
              ready; it is waiting for the room service.
            </p>
          </div>
        </main>
      </>
    );
  }
}
