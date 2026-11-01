'use client';

import {
  ApiErrorCode,
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  CurrentBroadcastResponseSchema,
  CurrentUserResponseSchema,
  defaultRoomCategory,
  ListBroadcastHistoryResponseSchema,
  UpdateRoomResponseSchema,
} from '@livepulse/contracts';
import type {
  CurrentUserResponse,
  Room,
  RoomCategory,
} from '@livepulse/contracts';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { AuthEntryLink } from '../../components/auth-dialog-provider';
import { CategoryPicker } from '../../components/category-picker';
import { CategorySelect } from '../../components/category-select';
import { HostBroadcastStudio } from '../../components/host-broadcast-studio';
import { StatusNotice } from '../../components/status-notice';
import { StudioLiveChat } from '../../components/studio-live-chat';
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
  const [category, setCategory] = useState<RoomCategory>(defaultRoomCategory);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [history, setHistory] = useState<Room[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState('Offline');
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
      setCategory(response.room?.category ?? (await lastUsedCategory()));
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

  async function changeLiveCategory(room: Room, next: RoomCategory) {
    const previous = category;
    setCategory(next);
    setPending(true);
    setNotice(undefined);
    try {
      const response = await clientApiRequest(
        `/api/v1/rooms/${room.id}`,
        UpdateRoomResponseSchema,
        {
          body: JSON.stringify({
            category: next,
            expectedVersion: room.version,
          }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        },
      );
      setActiveRoom(response.room);
    } catch (error) {
      setCategory(previous);
      showError(error, 'The category could not be changed.');
      if (
        error instanceof ClientApiError &&
        error.code === ApiErrorCode.RoomVersionConflict
      ) {
        await loadStudio();
      }
    } finally {
      setPending(false);
    }
  }

  async function prepareBroadcast(): Promise<Room> {
    const parsed = CreateRoomRequestSchema.safeParse({
      category,
      description,
      title,
    });
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

  const detailsReady = CreateRoomRequestSchema.safeParse({
    description,
    title,
  }).success;
  const headerStatus = activeRoom ? 'On air' : broadcastStatus;

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-fg">Studio</h1>
          <nav aria-label="Studio" className="studio-tabs">
            {(
              [
                ['broadcast', 'Go live'],
                ['history', 'Broadcast history'],
              ] as const
            ).map(([destination, label]) => (
              <button
                aria-current={view === destination ? 'page' : undefined}
                className="studio-tab"
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
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`studio-status ${activeRoom ? 'studio-status-live' : ''}`}
          >
            {activeRoom ? (
              <span aria-hidden="true" className="channel-dot" />
            ) : null}
            {headerStatus}
          </span>
          {user ? (
            <span className="hidden text-muted sm:inline">{user.email}</span>
          ) : null}
        </div>
      </header>

      {notice ? (
        <StatusNotice className="mt-5" tone={notice.kind}>
          {notice.message}
        </StatusNotice>
      ) : null}

      <div className="mt-6">
        <section
          aria-label="Go live"
          className={view === 'broadcast' ? '' : 'hidden'}
        >
          <HostBroadcastStudio
            chat={
              activeRoom?.status === 'LIVE' ? (
                <StudioLiveChat room={activeRoom} />
              ) : undefined
            }
            details={
              activeRoom ? (
                <div className="studio-onair-meta">
                  <h2
                    className="studio-onair-title"
                    title={activeRoom.description}
                  >
                    {activeRoom.title}
                  </h2>
                  <CategorySelect
                    disabled={pending}
                    onChange={(next) =>
                      void changeLiveCategory(activeRoom, next)
                    }
                    value={category}
                  />
                  <Link
                    className="text-sm font-semibold text-accent hover:underline"
                    href={`/rooms/${activeRoom.id}`}
                    rel="noopener"
                    target="_blank"
                  >
                    Open viewer page
                    <span className="sr-only"> (opens in a new tab)</span>
                    <span aria-hidden="true"> ↗</span>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-fg">Stream info</h2>
                  <StudioField
                    disabled={pending}
                    label="Room title"
                    onChange={setTitle}
                    placeholder="Design critique"
                    value={title}
                  />
                  <CategoryPicker
                    disabled={pending}
                    hint="Defaults to the category you used last time. You can change it while live."
                    onChange={setCategory}
                    value={category}
                  />
                  <StudioTextArea
                    disabled={pending}
                    label="Description"
                    onChange={setDescription}
                    placeholder="What will the audience experience?"
                    value={description}
                  />
                </div>
              )
            }
            detailsReady={detailsReady}
            disabled={pending}
            onAbort={abortBroadcast}
            onEnd={endBroadcast}
            onGoLive={markBroadcastReady}
            onPrepare={prepareBroadcast}
            onStatusChange={setBroadcastStatus}
            room={activeRoom}
          />
        </section>
        {view === 'history' ? (
          <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-lg font-bold text-fg">Broadcast history</h2>
            <p className="mt-2 text-sm text-muted">
              Ended broadcasts appear here. A history entry does not imply that
              a recording is available.
            </p>
            <form
              aria-label="Search broadcast history"
              className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]"
              onSubmit={searchHistory}
            >
              <label className="text-sm font-medium text-fg-soft">
                Search title
                <input
                  className="mt-1.5 w-full rounded-lg border border-line-strong bg-sunken px-3 py-2.5 text-fg outline-none transition focus:border-accent"
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
                  className="mt-1.5 w-full rounded-lg border border-line-strong bg-sunken px-3 py-2.5 text-fg outline-none transition focus:border-accent"
                  onChange={(event) => setSearchDate(event.target.value)}
                  type="date"
                  value={searchDate}
                />
              </label>
              <button
                className="self-end rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-on-accent transition hover:bg-accent-hover"
                type="submit"
              >
                Search
              </button>
            </form>
            <div
              aria-busy={historyLoading}
              className="mt-6 divide-y divide-line border-y border-line"
            >
              {historyLoading ? (
                <p className="py-6 text-sm text-muted">Loading history…</p>
              ) : history.length ? (
                history.map((room) => (
                  <article className="py-4" key={room.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h3 className="font-semibold text-fg">{room.title}</h3>
                      <time
                        className="text-xs text-muted"
                        dateTime={room.createdAt}
                      >
                        {new Date(room.createdAt).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      {room.description}
                    </p>
                    <p className="mt-1 text-xs text-subtle">
                      Ended {new Date(room.updatedAt).toLocaleString()}
                    </p>
                  </article>
                ))
              ) : (
                <p className="py-10 text-center text-sm text-muted">
                  No ended broadcasts match these filters.
                </p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-fg transition hover:bg-raised disabled:opacity-40"
                disabled={pageIndex === 0 || historyLoading}
                onClick={() => setPageIndex((current) => current - 1)}
                type="button"
              >
                Previous
              </button>
              <span className="text-xs text-muted">Page {pageIndex + 1}</span>
              <button
                className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-fg transition hover:bg-raised disabled:opacity-40"
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

/** The category of the host's latest ended broadcast, if any. */
async function lastUsedCategory(): Promise<RoomCategory> {
  try {
    const latest = await clientApiRequest(
      '/api/v1/rooms/mine/history?limit=1',
      ListBroadcastHistoryResponseSchema,
    );
    return latest.items[0]?.category ?? defaultRoomCategory;
  } catch {
    return defaultRoomCategory;
  }
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
        className="mt-1.5 w-full rounded-lg border border-line-strong bg-sunken px-3 py-2.5 text-fg outline-none transition placeholder:text-subtle focus:border-accent disabled:cursor-not-allowed disabled:text-muted"
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
        className="mt-1.5 min-h-28 w-full resize-y rounded-lg border border-line-strong bg-sunken px-3 py-2.5 text-fg outline-none transition placeholder:text-subtle focus:border-accent disabled:cursor-not-allowed disabled:text-muted"
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
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-fg">
          {title}
        </h1>
        {actionHref === '/auth' && actionLabel ? (
          <AuthEntryLink className="mt-8 inline-flex rounded-lg bg-accent px-5 py-2.5 font-bold text-on-accent transition hover:bg-accent-hover">
            {actionLabel}
          </AuthEntryLink>
        ) : actionHref && actionLabel ? (
          <Link
            className="mt-8 inline-flex rounded-lg bg-accent px-5 py-2.5 font-bold text-on-accent transition hover:bg-accent-hover"
            href={actionHref}
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
