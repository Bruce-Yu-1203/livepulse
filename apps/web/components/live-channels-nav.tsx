import type { VisibleRoom } from '@livepulse/contracts';
import Link from 'next/link';

import { orderRoomsForChannels, roomMonogram } from '../lib/presentation';
import { formatLikeCount } from '../lib/room-likes';

export function LiveChannelsNav({
  activeRoomId,
  rooms,
}: {
  activeRoomId?: string;
  rooms: VisibleRoom[];
}) {
  const channels = orderRoomsForChannels(rooms);

  return (
    <nav aria-label="Live channels" className="channel-rail">
      <h2 className="channel-rail-title">Live channels</h2>
      {channels.length > 0 ? (
        <ul>
          {channels.map((room) => {
            const isLive = room.status === 'LIVE';
            return (
              <li key={room.id}>
                <Link
                  aria-current={room.id === activeRoomId ? 'page' : undefined}
                  className="channel-link"
                  href={`/rooms/${room.id}`}
                >
                  <span
                    aria-hidden="true"
                    className={`channel-avatar ${isLive ? 'channel-avatar-live' : ''}`}
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
