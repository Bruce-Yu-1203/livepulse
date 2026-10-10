'use client';

import type { VisibleRoom } from '@livepulse/contracts';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { useState } from 'react';

import type { ChatMessage } from '../lib/room-chat';
import { useRoomChat } from '../lib/use-room-chat';

export function LiveRoomExperience({ room }: { room: VisibleRoom }) {
  const chat = useRoomChat(room.id, room.status);
  const [danmakuVisible, setDanmakuVisible] = useState(true);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    if (chat.sendMessage(String(data.get('message') ?? ''))) {
      form.reset();
    }
  }

  return (
    <div className="mt-7 grid overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/40 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="relative isolate overflow-hidden bg-zinc-950">
        <video
          className="aspect-video h-full min-h-64 w-full object-cover"
          controls
          poster={room.coverImageUrl}
          preload="metadata"
          src={room.demoVideoUrl}
        >
          Your browser does not support embedded video.
        </video>
        {danmakuVisible ? <DanmakuLayer messages={chat.messages} /> : null}
        <button
          className="absolute right-4 top-4 z-20 rounded-full border border-white/15 bg-black/65 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/80"
          onClick={() => setDanmakuVisible((visible) => !visible)}
          type="button"
        >
          Danmaku {danmakuVisible ? 'on' : 'off'}
        </button>
      </div>

      <aside className="flex min-h-[30rem] flex-col border-t border-white/10 bg-[#0d0e12] lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-white">Live chat</p>
            <p className="mt-1 text-xs text-zinc-500">
              {connectionLabel(chat.connection)}
            </p>
          </div>
          <span
            className={`h-2.5 w-2.5 rounded-full ${connectionColor(chat.connection)}`}
          />
        </div>

        <div
          aria-live="polite"
          className="flex-1 space-y-4 overflow-y-auto px-5 py-5 lg:max-h-[31rem]"
        >
          {chat.canLoadEarlier ? (
            <button
              className="mx-auto block rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-400 transition hover:border-cyan-300/40 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-50"
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
              />
            ))
          ) : (
            <div className="grid h-full min-h-48 place-items-center text-center">
              <div>
                <p className="text-sm font-medium text-zinc-300">
                  The chat is ready.
                </p>
                <p className="mt-2 text-xs leading-5 text-zinc-600">
                  Be the first to say something useful.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/8 p-4">
          {room.status !== 'LIVE' ? (
            <p className="rounded-2xl bg-white/5 px-4 py-3 text-center text-sm text-zinc-400">
              Chat closed when this broadcast ended.
            </p>
          ) : chat.authChecked && !chat.userId ? (
            <Link
              className="block rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-zinc-950 transition hover:bg-cyan-200"
              href="/auth"
            >
              Sign in to chat
            </Link>
          ) : (
            <form className="flex gap-2" onSubmit={submit}>
              <input
                aria-label="Chat message"
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-cyan-300/50"
                disabled={!chat.userId || chat.connection !== 'connected'}
                maxLength={200}
                name="message"
                placeholder="Write a message"
                required
              />
              <button
                className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-40"
                disabled={!chat.userId || chat.connection !== 'connected'}
                type="submit"
              >
                Send
              </button>
            </form>
          )}
          {chat.error ? (
            <p className="mt-3 text-xs leading-5 text-rose-300" role="status">
              {chat.error}
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
}: {
  currentUserId: string | undefined;
  message: ChatMessage;
}) {
  return (
    <div className={message.status === 'failed' ? 'opacity-50' : undefined}>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold text-cyan-300">
          {message.authorId === currentUserId
            ? 'You'
            : `Viewer ${message.authorId.slice(0, 5)}`}
        </span>
        <span className="text-zinc-700">
          {message.status === 'pending'
            ? 'sending…'
            : message.status === 'failed'
              ? 'failed'
              : formatMessageTime(message.acceptedAt)}
        </span>
      </div>
      <p className="mt-1 break-words text-sm leading-6 text-zinc-300">
        {message.text}
      </p>
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

function DanmakuLayer({ messages }: { messages: ChatMessage[] }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      aria-hidden="true"
    >
      {messages.slice(-8).map((message, index) => (
        <span
          className="danmaku-message absolute whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-sm font-medium text-white shadow-lg backdrop-blur-sm"
          key={`${message.id}:${index}`}
          style={{ top: `${12 + (index % 6) * 12}%` }}
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
    return 'Replay mode';
  }

  return connection === 'connecting' ? 'Connecting…' : 'Reconnecting…';
}

function connectionColor(
  connection: ReturnType<typeof useRoomChat>['connection'],
): string {
  if (connection === 'connected') {
    return 'bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.8)]';
  }

  if (connection === 'ended') {
    return 'bg-zinc-600';
  }

  return 'animate-pulse bg-amber-300';
}
