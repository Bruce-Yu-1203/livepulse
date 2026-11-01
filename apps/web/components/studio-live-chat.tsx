'use client';

import { useRoomChat } from '../lib/use-room-chat';
import { RoomChatPanel, type RoomChatPanelRoom } from './room-chat-panel';

/** The live room's chat, shown inside the studio while the host is on air. */
export function StudioLiveChat({ room }: { room: RoomChatPanelRoom }) {
  // The studio has no danmaku layer, so skip collecting overlay messages.
  const chat = useRoomChat(room.id, room.status, false);

  return (
    <RoomChatPanel
      chat={chat}
      className="h-full overflow-hidden rounded-xl border border-line"
      emptyHint="Messages from viewers appear here."
      room={room}
    />
  );
}
