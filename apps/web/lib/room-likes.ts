export interface RoomLikeState {
  likeCount: number;
  liked: boolean;
}

export function optimisticRoomLikeState(
  state: RoomLikeState,
  liked: boolean,
): RoomLikeState {
  if (state.liked === liked) {
    return state;
  }

  return {
    likeCount: Math.max(0, state.likeCount + (liked ? 1 : -1)),
    liked,
  };
}

export function formatLikeCount(likeCount: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(likeCount);
}
