'use client';

import { LiveChannelsResponseSchema } from '@livepulse/contracts';
import type { LiveChannel } from '@livepulse/contracts';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, MouseEvent } from 'react';

import { BROWSE_PATH, categoryName, formatLiveFor } from '../lib/categories';
import { clientApiRequest } from '../lib/client-api';
import { FOLLOWING_CHANGED_EVENT } from '../lib/follow-state';
import { avatarTone } from '../lib/presentation';
import { formatLikeCount } from '../lib/room-likes';
import { useAuthSession } from './auth-session-provider';

export const RAIL_COLLAPSED_KEY = 'livepulse-rail-collapsed';
export const LIVE_CHANNELS_ENDPOINT = '/api/v1/live-channels';
const popularPageSize = 8;

export function readRailCollapsed(raw: string | null): boolean {
  return raw === 'true';
}

export function groupLiveChannels(channels: LiveChannel[], signedIn: boolean) {
  const live = channels.filter((channel) => channel.room.status === 'LIVE');
  return {
    following: signedIn ? live.filter((channel) => channel.following) : [],
    popular: live.filter((channel) => !signedIn || !channel.following),
  };
}

export function LiveChannelsNav({
  activeRoomId,
  initialChannels,
}: {
  activeRoomId?: string;
  /** Channels loaded on the server; omitted when the page has none. */
  initialChannels?: LiveChannel[];
}) {
  const { session } = useAuthSession();
  const [channels, setChannels] = useState(initialChannels ?? []);
  // Server-rendered channels count as loaded, so the empty state is honest.
  const [loaded, setLoaded] = useState(initialChannels !== undefined);
  const skipFirstRefresh = useRef(initialChannels !== undefined);
  const [collapsed, setCollapsed] = useState(false);
  const [popularCount, setPopularCount] = useState(popularPageSize);
  const signedIn = session.status === 'authenticated';
  const { following, popular } = groupLiveChannels(channels, signedIn);

  // Read the saved choice after mount so server and client markup match.
  useEffect(() => {
    try {
      setCollapsed(readRailCollapsed(localStorage.getItem(RAIL_COLLAPSED_KEY)));
    } catch {
      // Storage unavailable: keep the rail expanded.
    }
  }, []);

  useEffect(() => {
    if (session.status === 'loading') return;
    const controller = new AbortController();
    let latestRequest = 0;
    const refresh = () => {
      const request = ++latestRequest;
      void clientApiRequest(
        LIVE_CHANNELS_ENDPOINT,
        LiveChannelsResponseSchema,
        { signal: controller.signal },
      )
        .then((response) => {
          if (request !== latestRequest) return;
          setChannels(response.items);
          setLoaded(true);
        })
        .catch(() => {
          // Keep the last usable list if the room service is unavailable.
        });
    };
    // The server already sent this list; refresh later rather than at once.
    if (skipFirstRefresh.current) {
      skipFirstRefresh.current = false;
    } else {
      refresh();
    }
    window.addEventListener('focus', refresh);
    window.addEventListener(FOLLOWING_CHANGED_EVENT, refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      latestRequest += 1;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(FOLLOWING_CHANGED_EVENT, refresh);
    };
  }, [session.status, signedIn]);

  useEffect(() => setPopularCount(popularPageSize), [session.status]);

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
      <Link
        aria-label="Browse categories"
        className="channel-browse-link"
        href={BROWSE_PATH}
        title="Browse categories"
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <rect height="7" rx="1.5" width="7" x="3" y="3" />
          <rect height="7" rx="1.5" width="7" x="14" y="3" />
          <rect height="7" rx="1.5" width="7" x="3" y="14" />
          <rect height="7" rx="1.5" width="7" x="14" y="14" />
        </svg>
        <span className="channel-browse-label">Browse categories</span>
      </Link>
      {loaded && following.length === 0 && popular.length === 0 ? (
        <p className="channel-empty">No one is live right now.</p>
      ) : null}
      {following.length > 0 ? (
        <ChannelGroup
          activeRoomId={activeRoomId}
          channels={following}
          title="Following"
        />
      ) : null}
      {following.length > 0 && popular.length > 0 ? (
        <div aria-hidden="true" className="channel-group-divider" />
      ) : null}
      {popular.length > 0 ? (
        <ChannelGroup
          activeRoomId={activeRoomId}
          channels={popular.slice(0, popularCount)}
          title="Popular"
        />
      ) : null}
      {popular.length > popularCount ? (
        <button
          className="channel-show-more"
          onClick={() => setPopularCount((count) => count + popularPageSize)}
          type="button"
        >
          Show more
        </button>
      ) : null}
    </nav>
  );
}

type ChannelPreview = {
  channel: LiveChannel;
  left: number;
  top: number;
};

const previewDelayMs = 300;

function ChannelGroup({
  activeRoomId,
  channels,
  title,
}: {
  activeRoomId?: string;
  channels: LiveChannel[];
  title: 'Following' | 'Popular';
}) {
  const [preview, setPreview] = useState<ChannelPreview | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // The rail scrolls, so the preview is fixed to the viewport beside the row.
  const show = (
    channel: LiveChannel,
    event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
    delay: number,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () =>
        setPreview({
          channel,
          left: rect.right + 10,
          top: rect.top + rect.height / 2,
        }),
      delay,
    );
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPreview(null);
  };

  return (
    <section aria-label={title} className="channel-group">
      <h3 className="channel-group-title">{title}</h3>
      <ul>
        {channels.map((channel) => {
          const { room, host, following } = channel;
          return (
            <li key={room.id}>
              <Link
                aria-current={room.id === activeRoomId ? 'page' : undefined}
                aria-label={`${host.name}: ${room.title}, live`}
                className="channel-link"
                href={`/rooms/${room.id}`}
                onBlur={hide}
                onFocus={(event) => show(channel, event, 0)}
                onMouseEnter={(event) => show(channel, event, previewDelayMs)}
                onMouseLeave={hide}
              >
                <span
                  aria-hidden="true"
                  className={`channel-avatar avatar-tone-${avatarTone(host.name)} ${following ? 'channel-avatar-following' : ''}`}
                >
                  {host.avatarUrl ? (
                    <img
                      alt=""
                      decoding="async"
                      loading="lazy"
                      src={host.avatarUrl}
                    />
                  ) : (
                    host.name.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="channel-text">
                  <span className="channel-name">{host.name}</span>
                  <span className="channel-description">
                    {categoryName(room.category)}
                  </span>
                </span>
                <span className="channel-meta">
                  <span aria-hidden="true" className="channel-dot" />
                  {formatLikeCount(room.likeCount)}
                  <span className="sr-only"> likes</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {preview ? <ChannelPopover preview={preview} /> : null}
    </section>
  );
}

function ChannelPopover({ preview }: { preview: ChannelPreview }) {
  const { room, host } = preview.channel;
  const liveFor = formatLiveFor(room.startedAt, Date.now());
  return (
    <div
      aria-hidden="true"
      className="channel-popover"
      style={{ left: preview.left, top: preview.top }}
    >
      <span className="channel-popover-host">{host.name}</span>
      <span className="channel-popover-title">{room.title}</span>
      <span className="channel-popover-meta">
        {categoryName(room.category)}
        {liveFor ? ` · Live for ${liveFor}` : ''}
      </span>
    </div>
  );
}
