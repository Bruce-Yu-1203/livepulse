import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-300">
          404 · Off air
        </p>
        <h1 className="mt-5 text-5xl font-semibold tracking-[-0.05em] text-white">
          This room is not available.
        </h1>
        <p className="mx-auto mt-4 max-w-lg leading-7 text-zinc-400">
          It may still be a private draft, or the address may not identify a
          room.
        </p>
        <Link
          className="mt-8 inline-block rounded-full bg-white px-6 py-3 font-bold text-zinc-950 transition hover:bg-cyan-200"
          href="/"
        >
          Explore public rooms
        </Link>
      </div>
    </main>
  );
}
