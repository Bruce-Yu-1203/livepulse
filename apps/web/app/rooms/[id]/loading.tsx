import {
  RouteLoadingShell,
  SkeletonBlock,
} from '../../../components/route-loading-shell';

export default function RoomLoading() {
  return (
    <RouteLoadingShell label="Loading room…">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <SkeletonBlock className="h-5 w-24 rounded-full" />
        <div className="mt-7 grid overflow-hidden rounded-[2rem] border border-fg/10 bg-surface lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="aspect-video min-h-64 bg-stage motion-safe:animate-pulse" />
          <div className="flex min-h-[30rem] flex-col border-t border-fg/10 p-5 lg:border-l lg:border-t-0">
            <SkeletonBlock className="h-5 w-24 rounded-full" />
            <SkeletonBlock className="mt-3 h-3 w-36 rounded-full" />
            <div className="mt-10 flex-1 space-y-8">
              {Array.from({ length: 4 }, (_, index) => (
                <div className="space-y-3" key={index}>
                  <SkeletonBlock className="h-3 w-20 rounded-full" />
                  <SkeletonBlock className="h-4 w-full rounded-full" />
                </div>
              ))}
            </div>
            <SkeletonBlock className="mt-8 h-12 w-full rounded-2xl" />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-4 rounded-3xl border border-fg/10 bg-surface p-5">
          <SkeletonBlock className="size-16 shrink-0 rounded-full" />
          <SkeletonBlock className="h-6 w-40 rounded-full" />
        </div>
        <div className="py-10 lg:py-14">
          <SkeletonBlock className="h-7 w-32 rounded-full" />
          <SkeletonBlock className="mt-6 h-12 w-3/4 rounded-2xl" />
          <SkeletonBlock className="mt-6 h-5 w-full max-w-2xl rounded-full" />
        </div>
      </div>
    </RouteLoadingShell>
  );
}
