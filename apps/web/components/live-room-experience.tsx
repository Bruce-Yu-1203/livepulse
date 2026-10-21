'use client';

import {
  MuteRoomUserResponseSchema,
  type VisibleRoom,
} from '@livepulse/contracts';
import { AuthEntryLink } from './auth-dialog-provider';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { clientApiRequest } from '../lib/client-api';
import {
  danmakuDensities,
  danmakuLayout,
  type DanmakuDensity,
} from '../lib/danmaku';
import {
  type ChatMessage,
  roomChatIsClosed,
  roomPresenceLabel,
} from '../lib/room-chat';
import { canModerateRoom } from '../lib/room-moderation';
import { useRoomChat } from '../lib/use-room-chat';
import { MessageReportForm } from './message-report-form';
import { RoomLikeButton } from './room-like-button';
import { LiveBroadcastPlayer } from './live-broadcast-player';

export function LiveRoomExperience({ room }: { room: VisibleRoom }) {
  const chat = useRoomChat(room.id, room.status);
  const [danmakuVisible, setDanmakuVisible] = useState(true);
  const [danmakuDensity, setDanmakuDensity] =
    useState<DanmakuDensity>('medium');
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());
  const [mutingUserId, setMutingUserId] = useState<string>();
  const [moderationError, setModerationError] = useState<string>();
  const canModerate = canModerateRoom(
    chat.userRole,
    chat.userId,
    room.hostId,
    room.status,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    if (chat.sendMessage(String(data.get('message') ?? ''))) {
      form.reset();
    }
  }

  async function muteUser(userId: string) {
    setMutingUserId(userId);
    setModerationError(undefined);

    try {
      await clientApiRequest(
        `/api/v1/rooms/${room.id}/mutes`,
        MuteRoomUserResponseSchema,
        {
          body: JSON.stringify({ durationMinutes: 10, userId }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      setMutedUserIds((current) => new Set(current).add(userId));
    } catch {
      setModerationError('This viewer could not be muted. Please try again.');
    } finally {
      setMutingUserId(undefined);
    }
  }

  return (
    <div className="mt-7 grid overflow-hidden rounded-[2rem] border border-fg/10 bg-surface shadow-2xl shadow-black/20 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="relative isolate overflow-hidden bg-stage">
        {room.status === 'LIVE' ? (
          <LiveBroadcastPlayer
            coverImageUrl={room.coverImageUrl}
            roomId={room.id}
          />
        ) : (
          <div className="relative aspect-video min-h-64 overflow-hidden bg-stage">
            {room.coverImageUrl ? (
              <img
                alt=""
                className="h-full w-full object-cover opacity-45"
                src={room.coverImageUrl}
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
          <DanmakuLayer density={danmakuDensity} messages={chat.messages} />
        ) : null}
        <div className="absolute bottom-4 left-4 z-20">
          <RoomLikeButton
            authChecked={chat.authChecked}
            initialLikeCount={room.likeCount}
            roomId={room.id}
            userId={chat.userId}
          />
        </div>
        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          <label className="rounded-full border border-white/15 bg-black/65 px-3 py-2 text-xs font-semibold text-white backdrop-blur">
            <span className="sr-only">Danmaku density</span>
            <select
              aria-label="Danmaku density"
              className="bg-transparent capitalize outline-none disabled:opacity-50"
              disabled={!danmakuVisible}
              onChange={(event) =>
                setDanmakuDensity(event.currentTarget.value as DanmakuDensity)
              }
              value={danmakuDensity}
            >
              {danmakuDensities.map((density) => (
                <option
                  className="bg-surface text-fg"
                  key={density}
                  value={density}
                >
                  {density} density
                </option>
              ))}
            </select>
          </label>
          <button
            aria-pressed={danmakuVisible}
            className="rounded-full border border-white/15 bg-black/65 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/80"
            onClick={() => setDanmakuVisible((visible) => !visible)}
            type="button"
          >
            Danmaku {danmakuVisible ? 'on' : 'off'}
          </button>
        </div>
      </div>

      <aside className="flex min-h-[30rem] flex-col border-t border-fg/10 bg-surface lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between border-b border-fg/8 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-fg">Live chat</p>
            <p className="mt-1 text-xs text-muted">
              {connectionLabel(chat.connection)}
              {chat.connection === 'connected'
                ? ` · ${roomPresenceLabel(
                    chat.uniqueUserCount,
                    chat.onlineCount,
                  )}`
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="rounded-full border border-fg/10 px-2.5 py-1 text-[0.65rem] font-semibold text-muted transition hover:border-accent/40 hover:text-accent disabled:cursor-wait disabled:opacity-50"
              disabled={chat.historyLoading}
              onClick={chat.synchronize}
              type="button"
            >
              {chat.historyLoading ? 'Syncing…' : 'Sync'}
            </button>
            <span
              aria-label={connectionLabel(chat.connection)}
              className={`h-2.5 w-2.5 rounded-full ${connectionColor(chat.connection)}`}
            />
          </div>
        </div>

        <div
          aria-live="polite"
          className="flex-1 space-y-4 overflow-y-auto px-5 py-5 lg:max-h-[31rem]"
        >
          {chat.canLoadEarlier ? (
            <button
              className="mx-auto block rounded-full border border-fg/10 px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent/40 hover:text-accent disabled:cursor-wait disabled:opacity-50"
              disabled={chat.historyLoading}
              onClick={chat.loadEarlier}
              type="button"
            >
              {chat.historyLoading ? 'Loading…' : 'Load earlier messages'}
            </button>
          ) : null}
          {chat.messages.length > 0 ? (
            chat.messages.map((message) => (
              <ChatMessageRow
                currentUserId={chat.userId}
                key={message.id}
                message={message}
                moderationEnabled={canModerate}
                muted={mutedUserIds.has(message.authorId)}
                muting={mutingUserId === message.authorId}
                onMute={muteUser}
                roomId={room.id}
              />
            ))
          ) : (
            <div className="grid h-full min-h-48 place-items-center text-center">
              <div>
                <p className="text-sm font-medium text-fg-soft">
                  The chat is ready.
                </p>
                <p className="mt-2 text-xs leading-5 text-subtle">
                  Be the first to say something useful.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-fg/8 p-4">
          {roomChatIsClosed(room.status, chat.connection) ? (
            <p className="rounded-2xl bg-fg/5 px-4 py-3 text-center text-sm text-muted">
              Chat closed when this broadcast ended.
            </p>
          ) : chat.authChecked && !chat.userId ? (
            <AuthEntryLink className="block rounded-2xl bg-fg px-4 py-3 text-center text-sm font-bold text-canvas transition hover:bg-accent hover:text-on-accent">
              Sign in to chat
            </AuthEntryLink>
          ) : (
            <form className="flex gap-2" onSubmit={submit}>
              <input
                aria-label="Chat message"
                className="min-w-0 flex-1 rounded-2xl border border-fg/10 bg-sunken px-4 py-3 text-sm text-fg outline-none placeholder:text-subtle focus:border-accent/50"
                disabled={!chat.userId || chat.connection !== 'connected'}
                maxLength={200}
                name="message"
                placeholder="Write a message"
                required
              />
              <button
                className="rounded-2xl bg-accent px-4 py-3 text-sm font-bold text-on-accent transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-40"
                disabled={!chat.userId || chat.connection !== 'connected'}
                type="submit"
              >
                Send
              </button>
            </form>
          )}
          {chat.error ? (
            <p className="mt-3 text-xs leading-5 text-danger" role="status">
              {chat.error}
            </p>
          ) : null}
          {moderationError ? (
            <p className="mt-3 text-xs leading-5 text-danger" role="status">
              {moderationError}
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function ChatMessageRow({
  currentUserId,
  message,
  moderationEnabled,
  muted,
  muting,
  onMute,
  roomId,
}: {
  currentUserId: string | undefined;
  message: ChatMessage;
  moderationEnabled: boolean;
  muted: boolean;
  muting: boolean;
  onMute(userId: string): void;
  roomId: string;
}) {
  return (
    <div className={message.status === 'failed' ? 'opacity-50' : undefined}>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold text-accent">
          {message.authorId === currentUserId
            ? 'You'
            : `Viewer ${message.authorId.slice(0, 5)}`}
        </span>
        <span className="text-subtle">
          {message.status === 'pending'
            ? 'sending…'
            : message.status === 'failed'
              ? 'failed'
              : formatMessageTime(message.acceptedAt)}
        </span>
        {moderationEnabled &&
        message.authorId !== currentUserId &&
        !message.deletedAt ? (
          <button
            className="ml-auto rounded-full border border-danger/20 px-2 py-1 text-[0.65rem] font-semibold text-danger transition hover:border-danger/50 disabled:cursor-wait disabled:opacity-50"
            disabled={muted || muting}
            onClick={() => onMute(message.authorId)}
            type="button"
          >
            {muted ? 'Muted' : muting ? 'Muting…' : 'Mute 10m'}
          </button>
        ) : null}
      </div>
      <p className="mt-1 break-words text-sm leading-6 text-fg-soft">
        {message.text}
      </p>
      {currentUserId &&
      message.authorId !== currentUserId &&
      message.status === 'sent' &&
      !message.deletedAt ? (
        <MessageReportForm messageId={message.id} roomId={roomId} />
      ) : null}
    </div>
  );
}

function formatMessageTime(acceptedAt: string | undefined): string {
  if (!acceptedAt) {
    return 'now';
  }

  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(acceptedAt));
}

function DanmakuLayer({
  density,
  messages,
}: {
  density: DanmakuDensity;
  messages: ChatMessage[];
}) {
  const layout = danmakuLayout(density);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      aria-hidden="true"
    >
      {messages
        .filter((message) => !message.deletedAt)
        .slice(-layout.limit)
        .map((message, index) => (
          <span
            className="danmaku-message absolute whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-sm font-medium text-white shadow-lg backdrop-blur-sm"
            key={`${message.id}:${index}`}
            style={{ top: `${8 + (index % layout.lanes) * 10}%` }}
          >
            {message.text}
          </span>
        ))}
    </div>
  );
}

function connectionLabel(
  connection: ReturnType<typeof useRoomChat>['connection'],
): string {
  if (connection === 'connected') {
    return 'Connected';
  }

  if (connection === 'ended') {
    return 'Broadcast ended';
  }

  return connection === 'connecting' ? 'Connecting…' : 'Reconnecting…';
}

function connectionColor(
  connection: ReturnType<typeof useRoomChat>['connection'],
): string {
  if (connection === 'connected') {
    return 'bg-success shadow-[0_0_14px_rgba(110,231,183,0.8)]';
  }

  if (connection === 'ended') {
    return 'bg-subtle';
  }

  return 'animate-pulse bg-warning';
}
