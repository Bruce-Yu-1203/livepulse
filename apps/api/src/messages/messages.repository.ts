import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { RoomMessage } from '@livepulse/contracts';
import { MongoClient, MongoServerError, ServerApiVersion } from 'mongodb';
import type { Collection, Filter } from 'mongodb';

import type { MessageCursor } from './message-cursor.js';
import { MessageDatabaseUnavailableError } from './messages.errors.js';

interface MessageDocument {
  _id: string;
  acceptedAt: Date;
  authorId: string;
  clientMessageId: string;
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
  list(input: {
    cursor?: MessageCursor;
    roomId: string;
    take: number;
  }): Promise<RoomMessage[]>;
}

const developmentMongoUrl = 'mongodb://localhost:27017/livepulse';

@Injectable()
export class MongoMessagesRepository
  implements MessagesRepository, OnModuleDestroy
{
  private readonly client: MongoClient;
  private readonly collection: Collection<MessageDocument>;
  private indexesReady: Promise<unknown> | undefined;

  public constructor() {
    const url = resolveMongoUrl({
      mongoUrl: process.env.MONGODB_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    this.client = new MongoClient(url, {
      serverApi: {
        deprecationErrors: true,
        strict: true,
        version: ServerApiVersion.v1,
      },
    });
    this.collection = this.client.db().collection<MessageDocument>('messages');
  }

  public async create(
    message: RoomMessage,
  ): Promise<
    | { kind: 'conflict' }
    | { kind: 'created'; message: RoomMessage }
    | { kind: 'duplicate'; message: RoomMessage }
  > {
    try {
      await this.ensureIndexes();
      await this.collection.insertOne(toDocument(message));
      return { kind: 'created', message };
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) {
        return this.resolveDuplicate(message);
      }

      throw new MessageDatabaseUnavailableError({ cause: error });
    }
  }

  public async list(input: {
    cursor?: MessageCursor;
    roomId: string;
    take: number;
  }): Promise<RoomMessage[]> {
    try {
      await this.ensureIndexes();
      const filter: Filter<MessageDocument> = { roomId: input.roomId };

      if (input.cursor) {
        filter.$or = [
          { acceptedAt: { $lt: input.cursor.acceptedAt } },
          {
            _id: { $lt: input.cursor.messageId },
            acceptedAt: input.cursor.acceptedAt,
          },
        ];
      }

      const documents = await this.collection
        .find(filter)
        .sort({ acceptedAt: -1, _id: -1 })
        .limit(input.take)
        .toArray();

      return documents.map(toRoomMessage);
    } catch (error) {
      throw new MessageDatabaseUnavailableError({ cause: error });
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  private ensureIndexes(): Promise<unknown> {
    this.indexesReady ??= Promise.all([
      this.collection.createIndex({ roomId: 1, acceptedAt: -1, _id: -1 }),
      this.collection.createIndex(
        { roomId: 1, authorId: 1, clientMessageId: 1 },
        { unique: true },
      ),
    ]).catch((error: unknown) => {
      this.indexesReady = undefined;
      throw error;
    });
    return this.indexesReady;
  }

  private async resolveDuplicate(
    message: RoomMessage,
  ): Promise<
    { kind: 'conflict' } | { kind: 'duplicate'; message: RoomMessage }
  > {
    try {
      const existing = await this.collection.findOne({
        authorId: message.authorId,
        clientMessageId: message.clientMessageId,
        roomId: message.roomId,
      });

      if (!existing) {
        throw new Error('The duplicate message could not be found');
      }

      const stored = toRoomMessage(existing);
      return stored.messageId === message.messageId &&
        stored.text === message.text
        ? { kind: 'duplicate', message: stored }
        : { kind: 'conflict' };
    } catch (error) {
      throw new MessageDatabaseUnavailableError({ cause: error });
    }
  }
}

interface MongoEnvironment {
  mongoUrl: string | undefined;
  nodeEnvironment: string | undefined;
}

export function resolveMongoUrl(environment: MongoEnvironment): string {
  if (environment.mongoUrl) {
    return environment.mongoUrl;
  }

  if (environment.nodeEnvironment === 'production') {
    throw new Error('MONGODB_URL is required in production');
  }

  return developmentMongoUrl;
}

function toDocument(message: RoomMessage): MessageDocument {
  return {
    _id: message.messageId,
    acceptedAt: new Date(message.acceptedAt),
    authorId: message.authorId,
    clientMessageId: message.clientMessageId,
    roomId: message.roomId,
    text: message.text,
  };
}

function toRoomMessage(document: MessageDocument): RoomMessage {
  return {
    acceptedAt: document.acceptedAt.toISOString(),
    authorId: document.authorId,
    clientMessageId: document.clientMessageId,
    messageId: document._id,
    roomId: document.roomId,
    text: document.text,
  };
}
