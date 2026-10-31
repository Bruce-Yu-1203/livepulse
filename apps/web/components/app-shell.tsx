import type { LiveChannel } from '@livepulse/contracts';
import type { ReactNode } from 'react';

import { LiveChannelsNav } from './live-channels-nav';
import { SiteHeader } from './site-header';

// Twitch-style frame: top bar, live channel rail on wide screens, content.
export function AppShell({
  activeRoomId,
  channels,
  children,
  mainClassName,
  searchQuery,
}: {
  activeRoomId?: string;
  /** Server-loaded live channels so the rail is filled on first paint. */
  channels?: LiveChannel[];
  children: ReactNode;
  mainClassName?: string;
  searchQuery?: string;
}) {
  return (
    <>
      <SiteHeader searchQuery={searchQuery} />
      <div className="app-shell">
        <LiveChannelsNav
          activeRoomId={activeRoomId}
          initialChannels={channels}
        />
        <main className={`app-shell-main ${mainClassName ?? ''}`}>
          {children}
        </main>
      </div>
    </>
  );
}
