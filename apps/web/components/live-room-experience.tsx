'use client';

import type { SearchUser, VisibleRoom } from '@livepulse/contracts';
import { useEffect, useRef, useState } from 'react';

import {
  danmakuLayout,
  type DanmakuDensity,
  type DanmakuMessage,
} from '../lib/danmaku';
import {
  CHAT_COLLAPSED_KEY,
  clampVolume,
  effectiveVolume,
} from '../lib/player-controls';
import { useRoomChat } from '../lib/use-room-chat';
import { BroadcastHostCard } from './broadcast-host-card';
import { LiveBroadcastPlayer } from './live-broadcast-player';
import { RoomChatPanel } from './room-chat-panel';
import { RoomLikeButton } from './room-like-button';
import { PlaybackControls, StageIcon, ViewingControls } from './stage-controls';

export function LiveRoomExperience({
  host,
  initialNow,
  room,
}: {
  host: SearchUser;
  initialNow: number;
  room: VisibleRoom;
}) {
  const [danmakuVisible, setDanmakuVisible] = useState(true);
  const [danmakuDensity, setDanmakuDensity] =
    useState<DanmakuDensity>('medium');
  const chat = useRoomChat(room.id, room.status, danmakuVisible);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setChatCollapsed(localStorage.getItem(CHAT_COLLAPSED_KEY) === 'true');
    } catch {
      // Storage unavailable: keep the chat open.
    }

    const syncFullscreen = () =>
      setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () =>
      document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  function setChatOpen(open: boolean) {
    setChatCollapsed(!open);
    try {
      localStorage.setItem(CHAT_COLLAPSED_KEY, String(!open));
    } catch {
      // The chat still toggles for this visit.
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stageRef.current?.requestFullscreen().catch(() => undefined);
    }
  }

  function refreshLive() {
    setPaused(false);
    setReloadKey((key) => key + 1);
  }

  return (
    <>
      <div
        className={`mt-7 grid overflow-hidden rounded-xl border border-fg/10 bg-surface shadow-[var(--lp-shadow)] ${
          chatCollapsed ? '' : 'lg:grid-cols-[minmax(0,1fr)_23rem]'
        }`}
      >
        <div
          className="room-stage relative isolate overflow-hidden bg-stage"
          ref={stageRef}
        >
          {room.status === 'LIVE' ? (
            <LiveBroadcastPlayer
              coverImageUrl={room.coverImageUrl}
              paused={paused}
              reloadKey={reloadKey}
              roomId={room.id}
              volume={effectiveVolume(volume, muted, paused)}
            />
          ) : (
            <div className="relative aspect-video min-h-64 overflow-hidden bg-stage">
              {room.coverImageUrl ? (
                <img
                  alt=""
                  className="h-full w-full object-cover opacity-45"
                  decoding="async"
                  height={720}
                  loading="eager"
                  src={room.coverImageUrl}
                  width={1280}
                />
              ) : null}
              <div className="absolute inset-0 grid place-items-center bg-black/55 text-center">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Broadcast ended
                  </p>
                  <p className="mt-2 text-xs text-white/60">
                    This room is no longer streaming live.
                  </p>
                </div>
              </div>
            </div>
          )}
          {danmakuVisible ? (
            <DanmakuLayer
              density={danmakuDensity}
              messages={chat.danmakuMessages}
            />
          ) : null}
          <div className="stage-overlay absolute left-4 top-14 z-20">
            <RoomLikeButton
              authChecked={chat.authChecked}
              initialLikeCount={room.likeCount}
              roomId={room.id}
              userId={chat.userId}
            />
          </div>
          {chatCollapsed ? (
            <button
              aria-label="Expand chat"
              className="stage-overlay stage-button stage-chat-expand"
              onClick={() => setChatOpen(true)}
              title="Expand chat"
              type="button"
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path
                  d="M20 4v16M15 12H4m4-4-4 4 4 4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
          ) : null}
          <div className="stage-overlay stage-controls">
            {room.status === 'LIVE' ? (
              <PlaybackControls
                muted={muted}
                onRefresh={refreshLive}
                onToggleMute={() => setMuted((value) => !value)}
                onTogglePause={() => setPaused((value) => !value)}
                onVolume={(value) => {
                  setVolume(clampVolume(value));
                  setMuted(value === 0);
                }}
                paused={paused}
                volume={volume}
              />
            ) : (
              <span />
            )}
            <ViewingControls
              danmakuDensity={danmakuDensity}
              danmakuVisible={danmakuVisible}
              fullscreen={fullscreen}
              onDanmakuDensity={setDanmakuDensity}
              onToggleDanmaku={() => setDanmakuVisible((visible) => !visible)}
              onToggleFullscreen={toggleFullscreen}
            />
          </div>
          {paused ? (
            <button
              aria-label="Resume"
              className="stage-paused"
              onClick={() => setPaused(false)}
              type="button"
            >
              <StageIcon name="play" />
            </button>
          ) : null}
        </div>

        <RoomChatPanel
          chat={chat}
          className="min-h-[30rem] border-t border-fg/10 lg:min-h-0 lg:border-l lg:border-t-0 lg:[contain:size]"
          hidden={chatCollapsed}
          listClassName="lg:max-h-[31rem]"
          onCollapse={() => setChatOpen(false)}
          room={room}
        />
      </div>
      <BroadcastHostCard
        connection={chat.connection}
        host={host}
        initialNow={initialNow}
        room={room}
        viewerCount={chat.uniqueUserCount}
      />
    </>
  );
}

function DanmakuLayer({
  density,
  messages,
}: {
  density: DanmakuDensity;
  messages: DanmakuMessage[];
}) {
  const layout = danmakuLayout(density);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      aria-hidden="true"
    >
      {messages.slice(-layout.limit).map((message) => (
        <span
          className="danmaku-message absolute whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-sm font-medium text-white shadow-lg backdrop-blur-sm"
          key={message.id}
          style={{ top: `${8 + (message.laneIndex % layout.lanes) * 10}%` }}
        >
          {message.text}
        </span>
      ))}
    </div>
  );
}
