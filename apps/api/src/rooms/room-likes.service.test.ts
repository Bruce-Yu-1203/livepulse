import { describe, expect, it, vi } from 'vitest';

import type { RoomLikesRepository } from './room-likes.repository.js';
import { RoomLikesService } from './room-likes.service.js';
import { RoomNotFoundError } from './rooms.errors.js';

const roomId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('RoomLikesService', () => {
  it('returns the current user like state', async () => {
    const likes = repository({
      get: vi.fn().mockResolvedValue({ likeCount: 4, liked: true }),
    });
    const service = new RoomLikesService(likes);

    await expect(service.get(roomId, userId)).resolves.toEqual({
      likeCount: 4,
      liked: true,
    });
    expect(likes.get).toHaveBeenCalledWith(roomId, userId);
  });

  it.each([true, false])('sets an idempotent liked=%s state', async (liked) => {
    const summary = { likeCount: liked ? 1 : 0, liked };
    const likes = repository({
      setLiked: vi.fn().mockResolvedValue(summary),
    });
    const service = new RoomLikesService(likes);

    await expect(service.setLiked(roomId, userId, liked)).resolves.toEqual(
      summary,
    );
    expect(likes.setLiked).toHaveBeenCalledWith(roomId, userId, liked);
  });

  it('hides missing and draft rooms as not found', async () => {
    const likes = repository({
      get: vi.fn().mockResolvedValue(undefined),
      setLiked: vi.fn().mockResolvedValue(undefined),
    });
    const service = new RoomLikesService(likes);

    await expect(service.get(roomId, userId)).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
    await expect(service.setLiked(roomId, userId, true)).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });
});

function repository(
  overrides: Partial<RoomLikesRepository> = {},
): RoomLikesRepository {
  return {
    get: vi.fn(),
    setLiked: vi.fn(),
    ...overrides,
  };
}
