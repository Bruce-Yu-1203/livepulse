import { InvalidMessageCursorError } from './messages.errors.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encodedCursorPattern = /^[A-Za-z0-9_-]+$/;

export interface MessageCursor {
  acceptedAt: Date;
  messageId: string;
}

export class MessageCursorCodec {
  public encode(cursor: MessageCursor): string {
    return Buffer.from(
      JSON.stringify({
        acceptedAt: cursor.acceptedAt.toISOString(),
        messageId: cursor.messageId,
        version: 1,
      }),
      'utf8',
    ).toString('base64url');
  }

  public decode(encoded: string): MessageCursor {
    try {
      if (!encodedCursorPattern.test(encoded)) {
        throw new Error('The cursor encoding is invalid');
      }

      const value: unknown = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      );
      if (!isCursorPayload(value)) {
        throw new Error('The cursor payload is invalid');
      }

      const acceptedAt = new Date(value.acceptedAt);
      if (acceptedAt.toISOString() !== value.acceptedAt) {
        throw new Error('The cursor timestamp is invalid');
      }

      return { acceptedAt, messageId: value.messageId };
    } catch (error) {
      throw new InvalidMessageCursorError({ cause: error });
    }
  }
}

interface CursorPayload {
  acceptedAt: string;
  messageId: string;
  version: 1;
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 3 &&
    candidate.version === 1 &&
    typeof candidate.acceptedAt === 'string' &&
    typeof candidate.messageId === 'string' &&
    uuidPattern.test(candidate.messageId)
  );
}
