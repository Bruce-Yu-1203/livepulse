'use client';

export default function ErrorPage({ reset }: { reset(): void }) {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-rose-300">
          Signal lost
        </p>
        <h1 className="mt-5 text-5xl font-semibold tracking-[-0.05em] text-white">
          Something interrupted the room.
        </h1>
        <p className="mx-auto mt-4 max-w-lg leading-7 text-zinc-400">
          The page could not finish loading. Try reconnecting to the service.
        </p>
        <button
          className="mt-8 rounded-full bg-white px-6 py-3 font-bold text-zinc-950 transition hover:bg-cyan-200"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
