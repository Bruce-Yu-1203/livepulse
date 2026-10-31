'use client';

import type { VisibleRoom } from '@livepulse/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  avatarTone,
  orderRoomsForChannels,
  roomMonogram,
} from '../lib/presentation';
import { formatLikeCount } from '../lib/room-likes';

export const RAIL_COLLAPSED_KEY = 'livepulse-rail-collapsed';

export function readRailCollapsed(raw: string | null): boolean {
  return raw === 'true';
}

export function LiveChannelsNav({
  activeRoomId,
  rooms,
}: {
  activeRoomId?: string;
  rooms: VisibleRoom[];
}) {
  const channels = orderRoomsForChannels(rooms);
  const [collapsed, setCollapsed] = useState(false);

  // Read the saved choice after mount so server and client markup match.
  useEffect(() => {
    try {
      setCollapsed(readRailCollapsed(localStorage.getItem(RAIL_COLLAPSED_KEY)));
    } catch {
      // Storage unavailable: keep the rail expanded.
    }
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(RAIL_COLLAPSED_KEY, String(next));
    } catch {
      // The rail still toggles for this visit.
    }
  };

  return (
    <nav
      aria-label="Live channels"
      className={`channel-rail ${collapsed ? 'channel-rail-collapsed' : ''}`}
      data-collapsed={collapsed}
    >
      <div className="channel-rail-header">
        <h2 className="channel-rail-title">Live channels</h2>
        <button
          aria-expanded={!collapsed}
          aria-label={
            collapsed ? 'Expand live channels' : 'Collapse live channels'
          }
          className="channel-rail-toggle"
          onClick={toggle}
          title={collapsed ? 'Expand' : 'Collapse'}
          type="button"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <path
              d={
                collapsed
                  ? 'M4 4v16M9 12h11m-4-4 4 4-4 4'
                  : 'M20 4v16M15 12H4m4-4-4 4 4 4'
              }
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </button>
      </div>
      {channels.length > 0 ? (
        <ul>
          {channels.map((room) => {
            const isLive = room.status === 'LIVE';
            return (
              <li key={room.id}>
                <Link
                  aria-current={room.id === activeRoomId ? 'page' : undefined}
                  className="channel-link"
                  title={collapsed ? room.title : undefined}
                  href={`/rooms/${room.id}`}
                >
                  <span
                    aria-hidden="true"
                    className={`channel-avatar avatar-tone-${avatarTone(room.title)} ${isLive ? 'channel-avatar-live' : 'channel-avatar-ended'}`}
                  >
                    {roomMonogram(room.title)}
                  </span>
                  <span className="channel-text">
                    <span className="channel-name">{room.title}</span>
                    <span className="channel-description">
                      {room.description}
                    </span>
                  </span>
                  {isLive ? (
                    <span className="channel-meta">
                      <span aria-hidden="true" className="channel-dot" />
                      <span className="sr-only">Live, </span>
                      {formatLikeCount(room.likeCount)}
                      <span className="sr-only"> likes</span>
                    </span>
                  ) : (
                    <span className="channel-meta channel-meta-ended">
                      Ended
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="channel-empty">
          Rooms appear here when hosts publish them.
        </p>
      )}
    </nav>
  );
}
