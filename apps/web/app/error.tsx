'use client';

export default function ErrorPage({ reset }: { reset(): void }) {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <p className="text-sm font-bold text-danger">Signal lost</p>
        <h1 className="mt-5 text-5xl font-semibold tracking-[-0.05em] text-fg">
          Something interrupted the room.
        </h1>
        <p className="mx-auto mt-4 max-w-lg leading-7 text-muted">
          The page could not finish loading. Try reconnecting to the service.
        </p>
        <button
          className="mt-8 rounded-full bg-fg px-6 py-3 font-bold text-canvas transition hover:bg-accent hover:text-on-accent"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
