import type { VisibleRoom } from '@livepulse/contracts';
import Link from 'next/link';

import { formatRoomDate, roomStatusLabel } from '../lib/presentation';
import { formatLikeCount } from '../lib/room-likes';

export function RoomCard({ room }: { room: VisibleRoom }) {
  const isLive = room.status === 'LIVE';

  return (
    <article className="room-card">
      <Link aria-label={`Open ${room.title}`} href={`/rooms/${room.id}`}>
        <div className="room-card-image">
          {room.coverImageUrl ? (
            <img
              alt=""
              decoding="async"
              loading="lazy"
              src={room.coverImageUrl}
            />
          ) : (
            <div className="room-card-placeholder" />
          )}
          <span
            className={`room-card-status ${isLive ? '' : 'room-card-status-ended'}`}
          >
            {roomStatusLabel(room.status)}
          </span>
        </div>
        <div className="room-card-body">
          <time className="room-card-date" dateTime={room.createdAt}>
            {formatRoomDate(room.createdAt)}
          </time>
          <h2>{room.title}</h2>
          <p>{room.description}</p>
          <div className="room-card-footer">
            <span>{formatLikeCount(room.likeCount)} likes</span>
            <span>Enter room ↗</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
