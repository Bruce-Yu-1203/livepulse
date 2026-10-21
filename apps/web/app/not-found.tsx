import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <p className="text-sm font-bold text-accent">404 · Off air</p>
        <h1 className="mt-5 text-5xl font-semibold tracking-[-0.05em] text-fg">
          This room is not available.
        </h1>
        <p className="mx-auto mt-4 max-w-lg leading-7 text-muted">
          It may still be a private draft, or the address may not identify a
          room.
        </p>
        <Link
          className="mt-8 inline-block rounded-full bg-fg px-6 py-3 font-bold text-canvas transition hover:bg-accent hover:text-on-accent"
          href="/"
        >
          Explore public rooms
        </Link>
      </div>
    </main>
  );
}
