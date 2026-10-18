import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { RoomMessage } from '@livepulse/contracts';
import { Prisma } from '@livepulse/db';

import { DatabaseService } from '../database/database.service.js';
import type { MessageCursor } from './message-cursor.js';
import { MessageDatabaseUnavailableError } from './messages.errors.js';

interface StoredMessage {
  acceptedAt: Date;
  authorId: string;
  clientMessageId: string;
  deletedAt: Date | null;
  id: string;
  roomId: string;
  text: string;
}

export interface MessagesRepository {
  create(
    message: RoomMessage,
  ): Promise<
    | { kind: 'conflict' }
    | { kind: 'created'; message: RoomMessage }
    | { kind: 'duplicate'; message: RoomMessage }
  >;
  delete(
    roomId: string,
    messageId: string,
    deletedAt: Date,
  ): Promise<RoomMessage | undefined>;
  findById(roomId: string, messageId: string): Promise<RoomMessage | undefined>;
  list(input: {
    cursor?: MessageCursor;
    roomId: string;
    take: number;
  }): Promise<RoomMessage[]>;
}

const messageRetentionMilliseconds = 7 * 24 * 60 * 60 * 1_000;
export const deletedMessageText = 'Message removed by moderation';

@Injectable()
export class PostgresMessagesRepository implements MessagesRepository {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async create(
    message: RoomMessage,
  ): Promise<
    | { kind: 'conflict' }
    | { kind: 'created'; message: RoomMessage }
    | { kind: 'duplicate'; message: RoomMessage }
  > {
    try {
      const acceptedAt = new Date(message.acceptedAt);
      const stored = await this.database.client.danmakuMessage.create({
        data: {
          acceptedAt,
          authorId: message.authorId,
          clientMessageId: message.clientMessageId,
          expiresAt: new Date(
            acceptedAt.getTime() + messageRetentionMilliseconds,
          ),
          id: message.messageId,
          payloadHash: messagePayloadHash(message),
          roomId: message.roomId,
          text: message.text,
        },
      });

      return { kind: 'created', message: toRoomMessage(stored) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.resolveDuplicate(message);
      }

      throwMessageDatabaseError(error);
    }
  }

  public async findById(
    roomId: string,
    messageId: string,
  ): Promise<RoomMessage | undefined> {
    try {
      const stored = await this.database.client.danmakuMessage.findFirst({
        where: { id: messageId, roomId },
      });

      return stored ? toRoomMessage(stored) : undefined;
    } catch (error) {
      throwMessageDatabaseError(error);
    }
  }

  public async delete(
    roomId: string,
    messageId: string,
    deletedAt: Date,
  ): Promise<RoomMessage | undefined> {
    try {
      const updated = await this.database.client.danmakuMessage.updateMany({
        data: { deletedAt, text: deletedMessageText },
        where: { id: messageId, roomId },
      });

      if (updated.count === 0) {
        return undefined;
      }

      const stored = await this.database.client.danmakuMessage.findUnique({
        where: { id: messageId },
      });
      return stored ? toRoomMessage(stored) : undefined;
    } catch (error) {
      throwMessageDatabaseError(error);
    }
  }

  public async list(input: {
    cursor?: MessageCursor;
    roomId: string;
    take: number;
  }): Promise<RoomMessage[]> {
    try {
      const stored = await this.database.client.danmakuMessage.findMany({
        orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
        take: input.take,
        where: {
          ...(input.cursor
            ? {
                OR: [
                  { acceptedAt: { lt: input.cursor.acceptedAt } },
                  {
                    acceptedAt: input.cursor.acceptedAt,
                    id: { lt: input.cursor.messageId },
                  },
                ],
              }
            : {}),
          roomId: input.roomId,
        },
      });

      return stored.map(toRoomMessage);
    } catch (error) {
      throwMessageDatabaseError(error);
    }
  }

  private async resolveDuplicate(
    message: RoomMessage,
  ): Promise<
    { kind: 'conflict' } | { kind: 'duplicate'; message: RoomMessage }
  > {
    try {
      const existing = await this.database.client.danmakuMessage.findFirst({
        where: {
          OR: [
            { id: message.messageId },
            {
              authorId: message.authorId,
              clientMessageId: message.clientMessageId,
              roomId: message.roomId,
            },
          ],
        },
      });

      if (!existing) {
        throw new Error('The duplicate message could not be found');
      }

      const stored = toRoomMessage(existing);
      return stored.messageId === message.messageId &&
        stored.authorId === message.authorId &&
        stored.clientMessageId === message.clientMessageId &&
        stored.roomId === message.roomId &&
        stored.text === message.text &&
        existing.payloadHash === messagePayloadHash(message) &&
        existing.deletedAt === null
        ? { kind: 'duplicate', message: stored }
        : { kind: 'conflict' };
    } catch (error) {
      throwMessageDatabaseError(error);
    }
  }
}

export function messagePayloadHash(message: RoomMessage): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        authorId: message.authorId,
        clientMessageId: message.clientMessageId,
        messageId: message.messageId,
        roomId: message.roomId,
        text: message.text,
      }),
      'utf8',
    )
    .digest('hex');
}

function toRoomMessage(stored: StoredMessage): RoomMessage {
  return {
    acceptedAt: stored.acceptedAt.toISOString(),
    authorId: stored.authorId,
    clientMessageId: stored.clientMessageId,
    ...(stored.deletedAt ? { deletedAt: stored.deletedAt.toISOString() } : {}),
    messageId: stored.id,
    roomId: stored.roomId,
    text: stored.text,
  };
}

function throwMessageDatabaseError(error: unknown): never {
  if (error instanceof MessageDatabaseUnavailableError) {
    throw error;
  }

  throw new MessageDatabaseUnavailableError({ cause: error });
}
