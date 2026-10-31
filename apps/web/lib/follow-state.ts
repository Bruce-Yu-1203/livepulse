import type { FollowStateResponse } from '@livepulse/contracts';

export const FOLLOWING_CHANGED_EVENT = 'livepulse:following-changed';

export function notifyFollowingChanged(): void {
  window.dispatchEvent(new Event(FOLLOWING_CHANGED_EVENT));
}

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
