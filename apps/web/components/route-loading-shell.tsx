import type { ReactNode } from 'react';

import { SiteHeader } from './site-header';

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-fg/8 motion-safe:animate-pulse ${className}`} />;
}

export function RouteLoadingShell({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <>
      <SiteHeader />
      <div className="app-shell">
        <aside aria-hidden="true" className="channel-rail px-3 py-5">
          <SkeletonBlock className="h-5 w-28 rounded-full" />
          <div className="mt-8 space-y-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="flex items-center gap-3" key={index}>
                <SkeletonBlock className="size-8 shrink-0 rounded-full" />
                <SkeletonBlock className="h-4 flex-1 rounded-full" />
              </div>
            ))}
          </div>
        </aside>
        <main className="app-shell-main">
          <span className="sr-only" role="status">
            {label}
          </span>
          <div aria-hidden="true">{children}</div>
        </main>
      </div>
    </>
  );
}
