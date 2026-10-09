import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-[#07080b]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Link className="group flex items-center gap-3" href="/">
          <span className="relative grid h-9 w-9 place-items-center rounded-full border border-cyan-300/30 bg-cyan-300/10">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_24px_rgba(103,232,249,0.95)]" />
            <span className="absolute h-6 w-6 animate-ping rounded-full border border-cyan-300/20 motion-reduce:animate-none" />
          </span>
          <span className="text-lg font-semibold tracking-[-0.03em] text-white">
            LivePulse
          </span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            className="rounded-full px-4 py-2 text-zinc-300 transition hover:bg-white/8 hover:text-white"
            href="/"
          >
            Explore
          </Link>
          <Link
            className="rounded-full bg-white px-4 py-2 font-semibold text-zinc-950 transition hover:bg-cyan-200"
            href="/auth"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
