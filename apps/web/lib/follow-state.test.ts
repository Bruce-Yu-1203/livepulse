import type { FollowStateResponse } from '@livepulse/contracts';
import { describe, expect, it } from 'vitest';

import { optimisticFollowState } from './follow-state';

const state: FollowStateResponse = {
  followerCount: 7,
  following: false,
  followingCount: 2,
  requestId: 'follow-state',
};

describe('optimisticFollowState', () => {
  it('updates the target follower count immediately for follow and unfollow', () => {
    const followed = optimisticFollowState(state);

    expect(followed).toEqual({ ...state, followerCount: 8, following: true });
    expect(optimisticFollowState(followed)).toEqual(state);
  });

  it('does not make follower counts negative or change following counts', () => {
    expect(
      optimisticFollowState({ ...state, followerCount: 0, following: true }),
    ).toEqual({ ...state, followerCount: 0, following: false });
  });
});
