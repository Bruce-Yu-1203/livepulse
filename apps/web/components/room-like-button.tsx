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
import { StatusNotice } from './status-notice';

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
  const [burst, setBurst] = useState(0);
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
    if (liked) {
      setBurst((value) => value + 1);
    }
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
    'relative inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold backdrop-blur transition';

  if (authChecked && !userId) {
    return (
      <AuthEntryLink
        className={`${classes} border-white/15 bg-black/65 text-white hover:border-danger/50 hover:text-danger`}
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
            ? 'border-danger bg-danger text-on-accent'
            : 'border-white/15 bg-black/65 text-white hover:border-danger/50 hover:text-danger'
        } disabled:cursor-wait disabled:opacity-60`}
        disabled={!ready || pending}
        onClick={toggle}
        type="button"
      >
        <span
          aria-hidden="true"
          className={burst > 0 ? 'like-heart-pop' : undefined}
          key={`heart-${burst}`}
        >
          {state.liked ? '♥' : '♡'}
        </span>
        {pending ? (
          'Saving…'
        ) : (
          <span className="like-count-change" key={state.likeCount}>
            {label}
          </span>
        )}
        {burst > 0 ? (
          <span aria-hidden="true" className="like-plus" key={`plus-${burst}`}>
            +1
          </span>
        ) : null}
      </button>
      {error ? (
        <StatusNotice className="mt-2 max-w-56" compact tone="error">
          {error}
        </StatusNotice>
      ) : null}
    </div>
  );
}
