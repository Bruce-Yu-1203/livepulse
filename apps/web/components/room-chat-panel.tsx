'use client';

import {
  MuteRoomUserResponseSchema,
  type RoomStatus,
} from '@livepulse/contracts';
import type { FormEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { appendedChatMessageCount, isNearChatBottom } from '../lib/chat-scroll';
import { isChatBurst, recentArrivals } from '../lib/chat-motion';
import { clientApiRequest } from '../lib/client-api';
import {
  type ChatMessage,
  roomChatIsClosed,
  roomPresenceLabel,
} from '../lib/room-chat';
import { canModerateRoom } from '../lib/room-moderation';
import type { useRoomChat } from '../lib/use-room-chat';
import { AuthEntryLink } from './auth-dialog-provider';
import { ChatJumpButton } from './chat-jump-button';
import { MessageReportForm } from './message-report-form';
import { StatusNotice } from './status-notice';

export type RoomChatState = ReturnType<typeof useRoomChat>;

export interface RoomChatPanelRoom {
  hostId: string;
  id: string;
  status: RoomStatus;
}

/**
 * The live chat column: message list, history paging, host moderation and the
 * composer. The room page and the creator studio both render it so the host
 * sees the same conversation viewers do.
 */
export function RoomChatPanel({
  chat,
  className = '',
  emptyHint = 'Be the first to say something useful.',
  hidden = false,
  label = 'Live chat',
  listClassName = '',
  onCollapse,
  room,
}: {
  chat: RoomChatState;
  className?: string;
  emptyHint?: string;
  hidden?: boolean;
  label?: string;
  listClassName?: string;
  onCollapse?: () => void;
  room: RoomChatPanelRoom;
}) {
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());
  const [mutingUserId, setMutingUserId] = useState<string>();
  const [moderationError, setModerationError] = useState<string>();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const chatListRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string>(undefined);
  const arrivalTimesRef = useRef<number[]>([]);
  const [chatBurst, setChatBurst] = useState(false);
  const messageCount = chat.messages.length;

  // Track how fast messages arrive; entry motion pauses during a burst.
  useEffect(() => {
    if (messageCount === 0) {
      return;
    }
    const now = Date.now();
    arrivalTimesRef.current = [
      ...recentArrivals(arrivalTimesRef.current, now),
      now,
    ];
    setChatBurst(isChatBurst(arrivalTimesRef.current, now));
  }, [messageCount]);
  const nearChatBottomRef = useRef(true);
  const historyScrollRef = useRef<{ scrollHeight: number; scrollTop: number }>(
    undefined,
  );
  const previousRoomIdRef = useRef(room.id);

  useLayoutEffect(() => {
    const list = chatListRef.current;
    if (!list) return;

    if (previousRoomIdRef.current !== room.id) {
      previousRoomIdRef.current = room.id;
      lastMessageIdRef.current = undefined;
      nearChatBottomRef.current = true;
      historyScrollRef.current = undefined;
      setUnreadMessageCount(0);
    }

    const appended = appendedChatMessageCount(
      lastMessageIdRef.current,
      chat.messages,
    );
    lastMessageIdRef.current = chat.messages.at(-1)?.clientMessageId;

    if (historyScrollRef.current) {
      if (!chat.historyLoading) {
        list.scrollTop =
          historyScrollRef.current.scrollTop +
          list.scrollHeight -
          historyScrollRef.current.scrollHeight;
        historyScrollRef.current = undefined;
      }
      return;
    }

    if (nearChatBottomRef.current) {
      list.scrollTop = list.scrollHeight;
    } else if (appended > 0) {
      setUnreadMessageCount((count) => Math.min(100, count + appended));
    }
  }, [chat.historyLoading, chat.messages, room.id]);

  function jumpToLatest() {
    const list = chatListRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    nearChatBottomRef.current = true;
    setUnreadMessageCount(0);
  }

  function loadEarlierMessages() {
    const list = chatListRef.current;
    if (list) {
      historyScrollRef.current = {
        scrollHeight: list.scrollHeight,
        scrollTop: list.scrollTop,
      };
    }
    chat.loadEarlier();
  }

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
      jumpToLatest();
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
    <aside
      aria-label={label}
      className={`room-chat-panel flex flex-col bg-surface ${className}`}
      hidden={hidden}
    >
      <div className="flex items-center justify-between border-b border-fg/8 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-fg">{label}</p>
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
        <div className="flex items-center gap-2">
          <button
            className="min-h-11 rounded-full border border-fg/10 px-3 py-1 text-[0.65rem] font-semibold text-muted transition hover:border-accent/40 hover:text-accent disabled:cursor-wait disabled:opacity-50"
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
          {onCollapse ? (
            <button
              aria-label="Collapse chat"
              className="grid h-11 w-11 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg"
              onClick={onCollapse}
              title="Collapse chat"
              type="button"
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  d="M20 4v16M4 12h11m-4-4 4 4-4 4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          aria-live="polite"
          className={`room-chat-list h-full space-y-1 overflow-y-auto px-3 py-4 ${listClassName} ${chatBurst ? 'room-chat-list-busy' : ''}`}
          onScroll={(event) => {
            nearChatBottomRef.current = isNearChatBottom(event.currentTarget);
            if (nearChatBottomRef.current) setUnreadMessageCount(0);
          }}
          ref={chatListRef}
        >
          {chat.canLoadEarlier ? (
            <button
              className="mx-auto block rounded-full border border-fg/10 px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent/40 hover:text-accent disabled:cursor-wait disabled:opacity-50"
              disabled={chat.historyLoading}
              onClick={loadEarlierMessages}
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
                  {emptyHint}
                </p>
              </div>
            </div>
          )}
        </div>
        <ChatJumpButton count={unreadMessageCount} onClick={jumpToLatest} />
      </div>

      <div className="border-t border-fg/8 p-4">
        {roomChatIsClosed(room.status, chat.connection) ? (
          <p className="rounded-lg bg-fg/5 px-4 py-3 text-center text-sm text-muted">
            Chat closed when this broadcast ended.
          </p>
        ) : chat.authChecked && !chat.userId ? (
          <AuthEntryLink className="block rounded-lg bg-accent px-4 py-3 text-center text-sm font-semibold text-on-accent transition hover:bg-accent-hover">
            Sign in to chat
          </AuthEntryLink>
        ) : (
          <form className="flex gap-2" onSubmit={submit}>
            <input
              aria-label="Chat message"
              className="min-w-0 flex-1 rounded-lg border border-fg/10 bg-sunken px-4 py-3 text-sm text-fg outline-none placeholder:text-subtle focus:border-accent/50"
              disabled={!chat.userId || chat.connection !== 'connected'}
              maxLength={200}
              name="message"
              placeholder="Write a message"
              required
            />
            <button
              className="min-h-11 rounded-lg bg-accent px-4 py-3 text-sm font-bold text-on-accent transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-40"
              disabled={!chat.userId || chat.connection !== 'connected'}
              type="submit"
            >
              Send
            </button>
          </form>
        )}
        {chat.error ? (
          <StatusNotice className="mt-3" compact tone="error">
            {chat.error}
          </StatusNotice>
        ) : null}
        {moderationError ? (
          <StatusNotice className="mt-3" compact tone="error">
            {moderationError}
          </StatusNotice>
        ) : null}
      </div>
    </aside>
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
    <div
      className={`chat-message ${message.status === 'failed' ? 'opacity-50' : ''}`}
    >
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

function connectionLabel(connection: RoomChatState['connection']): string {
  if (connection === 'connected') {
    return 'Connected';
  }

  if (connection === 'ended') {
    return 'Broadcast ended';
  }

  return connection === 'connecting' ? 'Connecting…' : 'Reconnecting…';
}

function connectionColor(connection: RoomChatState['connection']): string {
  if (connection === 'connected') {
    return 'bg-success shadow-[0_0_14px_rgba(110,231,183,0.8)]';
  }

  if (connection === 'ended') {
    return 'bg-subtle';
  }

  return 'animate-pulse bg-warning';
}
