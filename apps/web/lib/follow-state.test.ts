import type { FollowStateResponse } from '@livepulse/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FOLLOWING_CHANGED_EVENT,
  notifyFollowingChanged,
  optimisticFollowState,
} from './follow-state';

afterEach(() => vi.unstubAllGlobals());

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

  it('notifies the live sidebar after a follow change', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    notifyFollowingChanged();
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: FOLLOWING_CHANGED_EVENT }),
    );
  });
});
