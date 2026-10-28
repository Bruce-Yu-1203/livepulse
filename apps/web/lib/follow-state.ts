import type { FollowStateResponse } from '@livepulse/contracts';

export function optimisticFollowState(
  state: FollowStateResponse,
): FollowStateResponse {
  const following = !state.following;

  return {
    ...state,
    followerCount: Math.max(0, state.followerCount + (following ? 1 : -1)),
    following,
  };
}
