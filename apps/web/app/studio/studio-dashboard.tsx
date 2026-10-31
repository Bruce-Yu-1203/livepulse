'use client';

import {
  ApiErrorCode,
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  CurrentBroadcastResponseSchema,
  CurrentUserResponseSchema,
  ListBroadcastHistoryResponseSchema,
  UpdateRoomResponseSchema,
} from '@livepulse/contracts';
import type { CurrentUserResponse, Room } from '@livepulse/contracts';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { AuthEntryLink } from '../../components/auth-dialog-provider';
import { HostBroadcastStudio } from '../../components/host-broadcast-studio';
import { StatusNotice } from '../../components/status-notice';
import {
  ClientApiError,
  clientApiRequest,
  clientApiVoidRequest,
} from '../../lib/client-api';
import { buildBroadcastHistorySearch } from '../../lib/studio-history';

type StudioState = 'forbidden' | 'loading' | 'ready' | 'signed-out';
type StudioView = 'broadcast' | 'history';
type Notice = { kind: 'error' | 'success'; message: string } | undefined;

export function StudioDashboard() {
  const [state, setState] = useState<StudioState>('loading');
  const [user, setUser] = useState<CurrentUserResponse['user']>();
  const [view, setView] = useState<StudioView>('broadcast');
  const [activeRoom, setActiveRoom] = useState<Room>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [history, setHistory] = useState<Room[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageCursors, setPageCursors] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [searchTitle, setSearchTitle] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [appliedTitle, setAppliedTitle] = useState('');
  const [appliedDate, setAppliedDate] = useState('');

  async function loadStudio() {
    try {
      const current = await clientApiRequest(
        '/api/v1/auth/me',
        CurrentUserResponseSchema,
      );
      if (!['ADMIN', 'HOST'].includes(current.user.role)) {
        setState('forbidden');
        return;
      }
      const response = await clientApiRequest(
        '/api/v1/rooms/mine/current',
        CurrentBroadcastResponseSchema,
      );
      setUser(current.user);
      setActiveRoom(response.room ?? undefined);
      setTitle(response.room?.title ?? '');
      setDescription(response.room?.description ?? '');
      setState('ready');
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 401) {
        setState('signed-out');
        return;
      }
      showError(error, 'The studio could not load.');
      setState('ready');
    }
  }

  useEffect(() => {
    void loadStudio();
    const reloadAfterSignIn = () => void loadStudio();
    window.addEventListener('livepulse:auth-changed', reloadAfterSignIn);
    return () =>
      window.removeEventListener('livepulse:auth-changed', reloadAfterSignIn);
  }, []);

  useEffect(() => {
    if (view !== 'history' || state !== 'ready') {
      return;
    }
    let cancelled = false;
    const cursor = pageCursors[pageIndex];
    const search = buildBroadcastHistorySearch({
      cursor,
      date: appliedDate,
      title: appliedTitle,
    });
    setHistoryLoading(true);
    void clientApiRequest(
      `/api/v1/rooms/mine/history?${search}`,
      ListBroadcastHistoryResponseSchema,
    )
      .then((page) => {
        if (cancelled) return;
        setHistory(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (!cancelled) showError(error, 'Broadcast history could not load.');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, state, pageIndex, pageCursors, appliedTitle, appliedDate]);

  async function prepareBroadcast(): Promise<Room> {
    const parsed = CreateRoomRequestSchema.safeParse({ title, description });
    if (!parsed.success) {
      throw new Error('Add a title and description before going live.');
    }
    setPending(true);
    setNotice(undefined);
    try {
      const response = await clientApiRequest(
        '/api/v1/rooms',
        CreateRoomResponseSchema,
        {
          body: JSON.stringify(parsed.data),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      return response.room;
    } finally {
      setPending(false);
    }
  }

  async function abortBroadcast(room: Room): Promise<void> {
    await clientApiVoidRequest(`/api/v1/rooms/${room.id}`, {
      method: 'DELETE',
    });
  }

  async function markBroadcastReady(
    room: Room,
    generatedCover?: string,
  ): Promise<boolean> {
    if (room.status === 'LIVE') {
      return true;
    }
    setPending(true);
    setNotice(undefined);
    try {
      const response = await clientApiRequest(
        `/api/v1/rooms/${room.id}`,
        UpdateRoomResponseSchema,
        {
          body: JSON.stringify({
            ...(generatedCover ? { coverImageUrl: generatedCover } : {}),
            expectedVersion: room.version,
            status: 'LIVE',
          }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        },
      );
      setActiveRoom(response.room);
      setNotice({ kind: 'success', message: 'Your broadcast is live.' });
      return true;
    } catch (error) {
      showError(error, 'The broadcast could not start.');
      await loadStudio();
      throw error;
    } finally {
      setPending(false);
    }
  }

  async function endBroadcast(room: Room): Promise<boolean> {
    setPending(true);
    setNotice(undefined);
    try {
      const response = await clientApiRequest(
        `/api/v1/rooms/${room.id}`,
        UpdateRoomResponseSchema,
        {
          body: JSON.stringify({
            expectedVersion: room.version,
            status: 'ENDED',
          }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        },
      );
      if (response.room.status !== 'ENDED') return false;
      setActiveRoom(undefined);
      setTitle('');
      setDescription('');
      setPageCursors([undefined]);
      setPageIndex(0);
      setNotice({
        kind: 'success',
        message: 'Broadcast ended and saved to history.',
      });
      return true;
    } catch (error) {
      showError(error, 'The broadcast could not be ended.');
      if (
        error instanceof ClientApiError &&
        error.code === ApiErrorCode.RoomVersionConflict
      ) {
        await loadStudio();
      }
      return false;
    } finally {
      setPending(false);
    }
  }

  function showError(error: unknown, fallback: string) {
    setNotice({
      kind: 'error',
      message: error instanceof Error ? error.message : fallback,
    });
  }

  function searchHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageCursors([undefined]);
    setPageIndex(0);
    setAppliedTitle(searchTitle.trim());
    setAppliedDate(searchDate);
  }

  if (state === 'loading') {
    return <StudioMessage eyebrow="Studio" title="Preparing your studio…" />;
  }
  if (state === 'signed-out') {
    return (
      <StudioMessage
        actionHref="/auth"
        actionLabel="Sign in"
        eyebrow="Authentication required"
        title="Sign in to open your studio."
      />
    );
  }
  if (state === 'forbidden') {
    return (
      <StudioMessage
        actionHref="/"
        actionLabel="Explore rooms"
        eyebrow="Host access required"
        title="Your viewer account does not have a studio yet."
      />
    );
  }

  return (
    <div>
      <section className="flex flex-col justify-between gap-6 border-b border-fg/8 pb-10 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold text-accent">Host studio</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-fg sm:text-6xl">
            Shape the next live moment.
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted">
            Set your stage, check your preview, and go live when you are ready.
          </p>
        </div>
        {user ? (
          <div className="rounded-lg border border-fg/8 bg-fg/[0.035] px-5 py-4 text-sm">
            <p className="font-medium text-fg">{user.email}</p>
            <p className="mt-1 text-xs text-muted">{user.role} account</p>
          </div>
        ) : null}
      </section>

      {notice ? (
        <StatusNotice className="mt-8" tone={notice.kind}>
          {notice.message}
        </StatusNotice>
      ) : null}

      <div className="mt-10 grid gap-8 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="self-start rounded-xl border border-fg/8 bg-fg/[0.035] p-4">
          <p className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-muted">
            Studio
          </p>
          <nav aria-label="Studio" className="space-y-2">
            {(
              [
                ['broadcast', 'Go live'],
                ['history', 'Broadcast history'],
              ] as const
            ).map(([destination, label]) => (
              <button
                aria-current={view === destination ? 'page' : undefined}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-semibold transition ${
                  view === destination
                    ? 'border-accent/35 bg-accent/8 text-accent'
                    : 'border-transparent text-fg-soft hover:border-fg/10 hover:bg-sunken'
                }`}
                key={destination}
                onClick={() => {
                  setView(destination);
                  setNotice(undefined);
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>
          {activeRoom ? (
            <p className="mt-5 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-xs leading-5 text-success">
              Live now · {activeRoom.title}
            </p>
          ) : null}
        </aside>

        <section
          className={`overflow-hidden rounded-xl border border-fg/8 bg-fg/[0.035] ${view === 'broadcast' ? '' : 'hidden'}`}
        >
          <div className="border-b border-fg/8 bg-sunken p-6 sm:p-8">
            <p className="text-xs font-bold text-accent">
              {activeRoom ? 'On air' : 'Go live'}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-fg">
              {activeRoom ? activeRoom.title : 'Prepare your broadcast'}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {activeRoom
                ? 'Your broadcast is live. If your connection drops, use Reconnect broadcast.'
                : 'Add the details, select your devices, and confirm the preview.'}
            </p>
          </div>
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-2">
            <StudioField
              disabled={Boolean(activeRoom) || pending}
              label="Room title"
              onChange={setTitle}
              placeholder="Design critique"
              value={title}
            />
            <StudioTextArea
              disabled={Boolean(activeRoom) || pending}
              label="Description"
              onChange={setDescription}
              placeholder="What will the audience experience?"
              value={description}
            />
          </div>
          <HostBroadcastStudio
            disabled={pending}
            onAbort={abortBroadcast}
            onEnd={endBroadcast}
            onGoLive={markBroadcastReady}
            onPrepare={prepareBroadcast}
            room={activeRoom}
          />
        </section>
        {view === 'history' ? (
          <section className="rounded-xl border border-fg/8 bg-fg/[0.035] p-6 sm:p-8">
            <p className="text-xs font-bold text-accent">Archive</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-fg">
              Broadcast history
            </h2>
            <p className="mt-2 text-sm text-muted">
              Ended broadcasts appear here. A history entry does not imply that
              a recording is available.
            </p>
            <form
              aria-label="Search broadcast history"
              className="mt-8 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]"
              onSubmit={searchHistory}
            >
              <label className="text-sm font-medium text-fg-soft">
                Search title
                <input
                  className="mt-2 w-full rounded-lg border border-fg/10 bg-sunken px-4 py-3 text-fg outline-none focus:border-accent/50"
                  maxLength={80}
                  onChange={(event) => setSearchTitle(event.target.value)}
                  placeholder="Room title"
                  type="search"
                  value={searchTitle}
                />
              </label>
              <label className="text-sm font-medium text-fg-soft">
                Broadcast date
                <input
                  className="mt-2 w-full rounded-lg border border-fg/10 bg-sunken px-4 py-3 text-fg outline-none focus:border-accent/50"
                  onChange={(event) => setSearchDate(event.target.value)}
                  type="date"
                  value={searchDate}
                />
              </label>
              <button
                className="self-end rounded-lg bg-fg px-5 py-3 text-sm font-bold text-canvas transition hover:bg-accent hover:text-on-accent"
                type="submit"
              >
                Search
              </button>
            </form>
            <div aria-busy={historyLoading} className="mt-8 space-y-3">
              {historyLoading ? (
                <p className="rounded-lg border border-fg/8 p-6 text-sm text-muted">
                  Loading history…
                </p>
              ) : history.length ? (
                history.map((room) => (
                  <article
                    className="rounded-lg border border-fg/8 bg-sunken p-5"
                    key={room.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold text-fg">
                        {room.title}
                      </h3>
                      <time
                        className="text-xs text-muted"
                        dateTime={room.createdAt}
                      >
                        {new Date(room.createdAt).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {room.description}
                    </p>
                    <p className="mt-3 text-xs text-subtle">
                      Ended {new Date(room.updatedAt).toLocaleString()}
                    </p>
                  </article>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-fg/10 px-6 py-10 text-center text-sm text-muted">
                  No ended broadcasts match these filters.
                </p>
              )}
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button
                className="rounded-full border border-fg/15 px-5 py-2.5 text-sm font-semibold text-fg disabled:opacity-40"
                disabled={pageIndex === 0 || historyLoading}
                onClick={() => setPageIndex((current) => current - 1)}
                type="button"
              >
                Previous
              </button>
              <span className="text-xs text-muted">Page {pageIndex + 1}</span>
              <button
                className="rounded-full border border-fg/15 px-5 py-2.5 text-sm font-semibold text-fg disabled:opacity-40"
                disabled={!nextCursor || historyLoading}
                onClick={() => {
                  if (!nextCursor) return;
                  setPageCursors((current) => [
                    ...current.slice(0, pageIndex + 1),
                    nextCursor,
                  ]);
                  setPageIndex((current) => current + 1);
                }}
                type="button"
              >
                Next
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function StudioField({
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange(value: string): void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block text-sm font-medium text-fg-soft">
      {label}
      <input
        className="mt-2 w-full rounded-lg border border-fg/10 bg-sunken px-4 py-3 text-fg outline-none transition placeholder:text-subtle focus:border-accent/50 focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:text-muted"
        disabled={disabled}
        maxLength={120}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required
        type="text"
        value={value}
      />
    </label>
  );
}

function StudioTextArea({
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange(value: string): void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block text-sm font-medium text-fg-soft">
      {label}
      <textarea
        className="mt-2 min-h-32 w-full resize-y rounded-lg border border-fg/10 bg-sunken px-4 py-3 text-fg outline-none transition placeholder:text-subtle focus:border-accent/50 focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:text-muted"
        disabled={disabled}
        maxLength={2000}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required
        value={value}
      />
    </label>
  );
}

function StudioMessage({
  actionHref,
  actionLabel,
  eyebrow,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="grid min-h-[65vh] place-items-center text-center">
      <div>
        <p className="text-xs font-bold text-accent">{eyebrow}</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-fg">
          {title}
        </h1>
        {actionHref === '/auth' && actionLabel ? (
          <AuthEntryLink className="mt-8 inline-flex rounded-full bg-fg px-6 py-3 font-bold text-canvas transition hover:bg-accent hover:text-on-accent">
            {actionLabel}
          </AuthEntryLink>
        ) : actionHref && actionLabel ? (
          <Link
            className="mt-8 inline-flex rounded-full bg-fg px-6 py-3 font-bold text-canvas transition hover:bg-accent hover:text-on-accent"
            href={actionHref}
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
