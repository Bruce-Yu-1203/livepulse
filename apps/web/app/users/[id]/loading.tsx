import {
  RouteLoadingShell,
  SkeletonBlock,
} from '../../../components/route-loading-shell';

export default function ProfileLoading() {
  return (
    <RouteLoadingShell label="Loading profile…">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <SkeletonBlock className="h-5 w-24 rounded-full" />
        <div className="mt-10 flex flex-wrap items-center gap-6 rounded-[2rem] border border-fg/8 bg-surface p-6 sm:p-9">
          <SkeletonBlock className="size-24 shrink-0 rounded-full" />
          <div className="w-full max-w-sm space-y-4">
            <SkeletonBlock className="h-3 w-28 rounded-full" />
            <SkeletonBlock className="h-10 w-56 max-w-full rounded-xl" />
            <SkeletonBlock className="h-5 w-36 rounded-full" />
            <SkeletonBlock className="h-10 w-28 rounded-full" />
          </div>
        </div>
        <section className="mt-12">
          <SkeletonBlock className="h-7 w-36 rounded-full" />
          <div className="home-room-grid">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index}>
                <SkeletonBlock className="aspect-video rounded-2xl" />
                <SkeletonBlock className="mt-4 h-5 w-3/4 rounded-full" />
                <SkeletonBlock className="mt-3 h-4 w-1/2 rounded-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </RouteLoadingShell>
  );
}
