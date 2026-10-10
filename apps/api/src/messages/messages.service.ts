import { Inject, Injectable } from '@nestjs/common';
import type { ListRoomMessagesQuery, RoomMessage } from '@livepulse/contracts';

import { RoomsService } from '../rooms/rooms.service.js';
import { MessageCursorCodec } from './message-cursor.js';
import type { MessagesRepository } from './messages.repository.js';
import { MESSAGES_REPOSITORY } from './messages.tokens.js';

export interface RealtimeMessagePublisher {
  publish(
    message: RoomMessage,
  ): Promise<
    | { kind: 'conflict' }
    | { kind: 'created'; message: RoomMessage }
    | { kind: 'duplicate'; message: RoomMessage }
  >;
}

@Injectable()
export class MessagesService implements RealtimeMessagePublisher {
  private readonly cursorCodec = new MessageCursorCodec();

  public constructor(
    @Inject(MESSAGES_REPOSITORY)
    private readonly messages: MessagesRepository,
    @Inject(RoomsService) private readonly rooms: RoomsService,
  ) {}

  public publish(message: RoomMessage) {
    return this.messages.create(message);
  }

  public async list(
    roomId: string,
    query: ListRoomMessagesQuery,
  ): Promise<{ items: RoomMessage[]; nextCursor: string | null }> {
    await this.rooms.getVisible(roomId);
    const cursor = query.cursor
      ? this.cursorCodec.decode(query.cursor)
      : undefined;
    const records = await this.messages.list({
      ...(cursor ? { cursor } : {}),
      roomId,
      take: query.limit + 1,
    });
    const hasNextPage = records.length > query.limit;
    const newestFirst = hasNextPage ? records.slice(0, query.limit) : records;
    const oldest = newestFirst.at(-1);

    return {
      items: newestFirst.toReversed(),
      nextCursor:
        hasNextPage && oldest
          ? this.cursorCodec.encode({
              acceptedAt: new Date(oldest.acceptedAt),
              messageId: oldest.messageId,
            })
          : null,
    };
  }
}
