import Link from 'next/link';

import { AuthPanel } from './auth-panel';

export default function AuthPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden px-5 py-8 sm:px-8">
      <div className="absolute left-[-10rem] top-[-8rem] -z-10 h-[32rem] w-[32rem] rounded-full bg-cyan-400/12 blur-[100px]" />
      <div className="absolute bottom-[-12rem] right-[-8rem] -z-10 h-[36rem] w-[36rem] rounded-full bg-violet-500/10 blur-[120px]" />
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link
          className="text-sm text-zinc-400 transition hover:text-white"
          href="/"
        >
          ← Back to rooms
        </Link>
        <span className="text-sm font-semibold text-white">LivePulse</span>
      </div>
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-16 py-16 lg:grid-cols-[1fr_28rem]">
        <section className="hidden lg:block">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">
            One identity, every room
          </p>
          <h2 className="mt-6 max-w-2xl text-6xl font-semibold leading-[0.98] tracking-[-0.055em] text-white">
            Be present when the moment happens.
          </h2>
          <p className="mt-7 max-w-xl text-lg leading-8 text-zinc-400">
            Join live conversations, return for replays, and keep one secure
            session across the entire experience.
          </p>
          <div className="mt-12 grid max-w-xl grid-cols-3 gap-4">
            {['Secure sessions', 'Live rooms', 'Instant replays'].map(
              (item) => (
                <div
                  className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-zinc-300"
                  key={item}
                >
                  {item}
                </div>
              ),
            )}
          </div>
        </section>
        <AuthPanel />
      </div>
    </main>
  );
}
