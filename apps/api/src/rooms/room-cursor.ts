import { InvalidRoomCursorError } from './rooms.errors.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encodedCursorPattern = /^[A-Za-z0-9_-]+$/;

export interface RoomCursor {
  createdAt: Date;
  id: string;
}

export class RoomCursorCodec {
  public encode(cursor: RoomCursor): string {
    return Buffer.from(
      JSON.stringify({
        createdAt: cursor.createdAt.toISOString(),
        id: cursor.id,
        version: 1,
      }),
      'utf8',
    ).toString('base64url');
  }

  public decode(encoded: string): RoomCursor {
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

      const createdAt = new Date(value.createdAt);
      if (createdAt.toISOString() !== value.createdAt) {
        throw new Error('The cursor timestamp is invalid');
      }

      return { createdAt, id: value.id };
    } catch (error) {
      throw new InvalidRoomCursorError({ cause: error });
    }
  }
}

interface CursorPayload {
  createdAt: string;
  id: string;
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
    typeof candidate.createdAt === 'string' &&
    typeof candidate.id === 'string' &&
    uuidPattern.test(candidate.id)
  );
}
