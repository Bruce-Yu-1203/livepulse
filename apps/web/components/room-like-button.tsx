'use client';

import { RoomLikeResponseSchema } from '@livepulse/contracts';
import { AuthEntryLink } from './auth-dialog-provider';
import { useEffect, useState } from 'react';

import { clientApiRequest, clientApiVoidRequest } from '../lib/client-api';
import {
  formatLikeCount,
  optimisticRoomLikeState,
  type RoomLikeState,
} from '../lib/room-likes';

export function RoomLikeButton({
  authChecked,
  initialLikeCount,
  roomId,
  userId,
}: {
  authChecked: boolean;
  initialLikeCount: number;
  roomId: string;
  userId: string | undefined;
}) {
  const [state, setState] = useState<RoomLikeState>({
    likeCount: initialLikeCount,
    liked: false,
  });
  const [ready, setReady] = useState(authChecked && !userId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;

    setState({ likeCount: initialLikeCount, liked: false });
    setError(undefined);

    if (!userId) {
      setReady(authChecked);
      return () => {
        active = false;
      };
    }

    setReady(false);
    void clientApiRequest(
      `/api/v1/rooms/${encodeURIComponent(roomId)}/likes/me`,
      RoomLikeResponseSchema,
    )
      .then((response) => {
        if (active) {
          setState(response);
          setReady(true);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load your reaction.',
          );
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [authChecked, initialLikeCount, roomId, userId]);

  async function toggle() {
    if (!userId || pending || !ready) {
      return;
    }

    const previous = state;
    const liked = !state.liked;
    setState(optimisticRoomLikeState(state, liked));
    setPending(true);
    setError(undefined);

    try {
      const path = `/api/v1/rooms/${encodeURIComponent(roomId)}/likes/me`;

      if (liked) {
        const response = await clientApiRequest(path, RoomLikeResponseSchema, {
          method: 'PUT',
        });
        setState(response);
      } else {
        await clientApiVoidRequest(path, { method: 'DELETE' });
      }
    } catch (caught) {
      setState(previous);
      setError(
        caught instanceof Error ? caught.message : 'Unable to update the like.',
      );
    } finally {
      setPending(false);
    }
  }

  const label = `${formatLikeCount(state.likeCount)} ${state.likeCount === 1 ? 'like' : 'likes'}`;
  const classes =
    'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold backdrop-blur transition';

  if (authChecked && !userId) {
    return (
      <AuthEntryLink
        className={`${classes} border-white/15 bg-black/65 text-white hover:border-rose-300/50 hover:text-rose-200`}
        label={`Sign in to like this room. ${label}`}
      >
        <span aria-hidden="true">♡</span>
        {label}
      </AuthEntryLink>
    );
  }

  return (
    <div>
      <button
        aria-label={`${state.liked ? 'Unlike' : 'Like'} this room. ${label}`}
        aria-pressed={state.liked}
        className={`${classes} ${
          state.liked
            ? 'border-rose-300/50 bg-rose-400/20 text-rose-100'
            : 'border-white/15 bg-black/65 text-white hover:border-rose-300/50 hover:text-rose-200'
        } disabled:cursor-wait disabled:opacity-60`}
        disabled={!ready || pending}
        onClick={toggle}
        type="button"
      >
        <span aria-hidden="true">{state.liked ? '♥' : '♡'}</span>
        {pending ? 'Saving…' : label}
      </button>
      {error ? (
        <p className="mt-2 max-w-56 text-xs text-rose-200" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
