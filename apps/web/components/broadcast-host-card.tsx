'use client';

import type { SearchUser, VisibleRoom } from '@livepulse/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatBroadcastDuration } from '../lib/broadcast-duration';
import { CategoryChip } from './category-chip';
import { FollowButton } from './follow-controls';
import { SearchUserAvatar } from './search-user-card';

export function BroadcastHostCard({
  connection,
  host,
  initialNow,
  room,
  viewerCount,
}: {
  connection: 'connected' | 'connecting' | 'ended' | 'reconnecting';
  host: SearchUser;
  initialNow: number;
  room: VisibleRoom;
  viewerCount: number;
}) {
  const [now, setNow] = useState(initialNow);
  const isLive = room.status === 'LIVE';

  useEffect(() => {
    if (!isLive || !room.startedAt) return;

    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [isLive, room.startedAt]);

  const onlineLabel =
    isLive && connection === 'connected'
      ? viewerCount.toLocaleString('en')
      : isLive
        ? '—'
        : '0';
  const durationLabel = isLive
    ? formatBroadcastDuration(room.startedAt, now)
    : '—';

  return (
    <section aria-label="Broadcaster" className="broadcast-host-card">
      <div className="broadcast-host-main">
        <Link className="broadcast-host-identity" href={`/users/${host.id}`}>
          <span
            className={`broadcast-host-avatar-wrap ${isLive ? 'broadcast-host-avatar-wrap--live' : ''}`}
          >
            <SearchUserAvatar
              className="broadcast-host-avatar"
              loading="eager"
              user={host}
            />
            {isLive ? (
              <span aria-label="Live" className="broadcast-host-live-badge">
                LIVE
              </span>
            ) : null}
          </span>
          <strong className="broadcast-host-name">{host.name}</strong>
        </Link>
        <CategoryChip category={room.category} />
      </div>

      <div className="broadcast-host-actions">
        <FollowButton userId={host.id} userName={host.name} />
        <div className="broadcast-host-stats">
          <span
            aria-label={`${onlineLabel} viewers online`}
            className="broadcast-host-viewers"
          >
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="7"
                r="4"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
            {onlineLabel}
          </span>
          <span
            aria-label={`Broadcast duration ${durationLabel}`}
            className="broadcast-host-duration"
          >
            {durationLabel}
          </span>
        </div>
      </div>
    </section>
  );
}
