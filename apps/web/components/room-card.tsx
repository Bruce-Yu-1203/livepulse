import type { VisibleRoom } from '@livepulse/contracts';
import Link from 'next/link';

import {
  formatRoomDate,
  roomMonogram,
  roomStatusLabel,
} from '../lib/presentation';
import { formatLikeCount } from '../lib/room-likes';

export function RoomCard({ room }: { room: VisibleRoom }) {
  const isLive = room.status === 'LIVE';

  return (
    <article className={`room-card ${isLive ? 'room-card-live' : ''}`}>
      <Link aria-label={`Open ${room.title}`} href={`/rooms/${room.id}`}>
        <div className="room-card-image">
          {room.coverImageUrl ? (
            <img
              alt=""
              decoding="async"
              height={360}
              loading="lazy"
              src={room.coverImageUrl}
              width={640}
            />
          ) : (
            <div className="room-card-placeholder" />
          )}
          <span
            className={`room-card-status ${isLive ? '' : 'room-card-status-ended'}`}
          >
            {roomStatusLabel(room.status)}
          </span>
          <span className="room-card-likes">
            {formatLikeCount(room.likeCount)} likes
          </span>
        </div>
        <div className="room-card-body">
          <span aria-hidden="true" className="room-card-avatar">
            {roomMonogram(room.title)}
          </span>
          <div className="room-card-text">
            <h2>{room.title}</h2>
            <p>{room.description}</p>
            <time className="room-card-date" dateTime={room.createdAt}>
              {formatRoomDate(room.createdAt)}
            </time>
          </div>
        </div>
      </Link>
    </article>
  );
}
