import { describe, expect, it } from 'vitest';

import { formatLikeCount, optimisticRoomLikeState } from './room-likes';

describe('room like helpers', () => {
  it('applies like and unlike states without double counting', () => {
    const liked = optimisticRoomLikeState({ likeCount: 7, liked: false }, true);

    expect(liked).toEqual({ likeCount: 8, liked: true });
    expect(optimisticRoomLikeState(liked, true)).toBe(liked);
    expect(optimisticRoomLikeState(liked, false)).toEqual({
      likeCount: 7,
      liked: false,
    });
  });

  it('never displays a negative count and compacts large totals', () => {
    expect(
      optimisticRoomLikeState({ likeCount: 0, liked: true }, false),
    ).toEqual({ likeCount: 0, liked: false });
    expect(formatLikeCount(1_200)).toBe('1.2K');
  });
});
