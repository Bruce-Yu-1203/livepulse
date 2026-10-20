import type { VisibleRoom } from '@livepulse/contracts';
import Link from 'next/link';

import { formatRoomDate, roomStatusLabel } from '../lib/presentation';
import { formatLikeCount } from '../lib/room-likes';

export function RoomCard({ room }: { room: VisibleRoom }) {
  const isLive = room.status === 'LIVE';

  return (
    <article className="group overflow-hidden rounded-[1.75rem] border border-white/8 bg-white/[0.035] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/25 hover:bg-white/[0.055]">
      <Link aria-label={`Open ${room.title}`} href={`/rooms/${room.id}`}>
        <div className="relative aspect-[16/10] overflow-hidden bg-zinc-900">
          <img
            alt=""
            className="h-full w-full object-cover opacity-80 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-95"
            decoding="async"
            loading="lazy"
            src={room.coverImageUrl}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
          <div
            className={`absolute left-4 top-4 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] ${
              isLive
                ? 'bg-rose-500 text-white shadow-[0_0_28px_rgba(244,63,94,0.4)]'
                : 'bg-black/65 text-zinc-200 backdrop-blur'
            }`}
          >
            {isLive ? (
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70 motion-reduce:animate-none" />
                <span className="relative inline-flex size-1.5 rounded-full bg-white" />
              </span>
            ) : null}
            {roomStatusLabel(room.status)}
          </div>
          <time
            className="absolute bottom-4 left-4 text-xs font-medium text-zinc-300"
            dateTime={room.createdAt}
          >
            {formatRoomDate(room.createdAt)}
          </time>
        </div>
        <div className="p-5">
          <h2 className="text-xl font-semibold tracking-[-0.025em] text-white transition group-hover:text-cyan-200">
            {room.title}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">
            {room.description}
          </p>
          <div className="mt-5 flex items-center justify-between border-t border-white/8 pt-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <HeartIcon />
              {formatLikeCount(room.likeCount)}
            </span>
            <span className="text-cyan-300 transition group-hover:translate-x-1">
              Enter room →
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function HeartIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
