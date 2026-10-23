'use client';

import { FollowStateResponseSchema } from '@livepulse/contracts';
import type { FollowStateResponse } from '@livepulse/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { clientApiRequest } from '../lib/client-api';
import { AuthEntryLink } from './auth-dialog-provider';
import { useAuthSession } from './auth-session-provider';

export function FollowButton({
  onChange,
  userId,
  userName,
}: {
  onChange?: (state: FollowStateResponse) => void;
  userId: string;
  userName: string;
}) {
  const { session } = useAuthSession();
  const viewerId =
    session.status === 'authenticated' ? session.user.id : undefined;
  const [state, setState] = useState<FollowStateResponse>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const path = `/api/v1/users/${encodeURIComponent(userId)}/follow`;

  useEffect(() => {
    if (!viewerId || viewerId === userId) return;
    let active = true;
    setState(undefined);
    setError(undefined);
    void clientApiRequest(path, FollowStateResponseSchema)
      .then((response) => {
        if (active) setState(response);
      })
      .catch(() => {
        if (active)
          setError('Could not load follow status. Refresh to try again.');
      });
    return () => {
      active = false;
    };
  }, [path, userId, viewerId]);

  async function toggle() {
    if (!state || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const next = await clientApiRequest(path, FollowStateResponseSchema, {
        method: state.following ? 'DELETE' : 'PUT',
      });
      setState(next);
      onChange?.(next);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not update follow status.',
      );
    } finally {
      setPending(false);
    }
  }

  if (viewerId === userId) return null;
  const classes =
    'inline-flex min-h-11 items-center justify-center rounded-full border border-accent px-5 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  if (session.status === 'anonymous') {
    return (
      <AuthEntryLink
        className={`${classes} bg-accent text-on-accent`}
        label={`Sign in to follow ${userName}`}
      >
        Follow
      </AuthEntryLink>
    );
  }
  return (
    <div>
      <button
        aria-label={`${state?.following ? 'Unfollow' : 'Follow'} ${userName}`}
        aria-pressed={state?.following ?? false}
        className={`${classes} ${state?.following ? 'bg-surface text-accent hover:bg-accent-soft' : 'bg-accent text-on-accent hover:bg-accent-hover'} disabled:cursor-wait disabled:opacity-60`}
        disabled={!state || pending}
        onClick={() => void toggle()}
        type="button"
      >
        {pending ? 'Saving…' : state?.following ? 'Unfollow' : 'Follow'}
      </button>
      {error ? (
        <p className="mt-2 text-xs text-danger" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ProfileFollowControls({
  followerCount,
  followingCount,
  userId,
  userName,
}: {
  followerCount: number;
  followingCount: number;
  userId: string;
  userName: string;
}) {
  const [counts, setCounts] = useState({ followerCount, followingCount });

  useEffect(() => {
    setCounts({ followerCount, followingCount });
  }, [followerCount, followingCount, userId]);

  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4">
      <Link
        className="inline-flex min-h-11 items-center text-sm text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        href={`/users/${userId}/following`}
      >
        <strong className="text-fg">{counts.followingCount}</strong> Following
      </Link>
      <Link
        className="inline-flex min-h-11 items-center text-sm text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        href={`/users/${userId}/followers`}
      >
        <strong className="text-fg">{counts.followerCount}</strong> Followers
      </Link>
      <FollowButton
        onChange={(state) =>
          setCounts({
            followerCount: state.followerCount,
            followingCount: state.followingCount,
          })
        }
        userId={userId}
        userName={userName}
      />
    </div>
  );
}
