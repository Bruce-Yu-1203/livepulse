export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
      <div className="h-8 w-36 animate-pulse rounded-full bg-white/8" />
      <div className="mt-6 h-16 max-w-2xl animate-pulse rounded-3xl bg-white/8" />
      <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="aspect-[4/3] animate-pulse rounded-[1.75rem] bg-white/[0.045]"
            key={index}
          />
        ))}
      </div>
    </main>
  );
}
