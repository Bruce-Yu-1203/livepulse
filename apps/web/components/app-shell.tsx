import type { ReactNode } from 'react';

import { LiveChannelsNav } from './live-channels-nav';
import { SiteHeader } from './site-header';

// Twitch-style frame: top bar, live channel rail on wide screens, content.
export function AppShell({
  activeRoomId,
  children,
  mainClassName,
  searchQuery,
}: {
  activeRoomId?: string;
  children: ReactNode;
  mainClassName?: string;
  searchQuery?: string;
}) {
  return (
    <>
      <SiteHeader searchQuery={searchQuery} />
      <div className="app-shell">
        <LiveChannelsNav activeRoomId={activeRoomId} />
        <main className={`app-shell-main ${mainClassName ?? ''}`}>
          {children}
        </main>
      </div>
    </>
  );
}
