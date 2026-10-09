'use client';

import {
  ApiErrorCode,
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  CurrentUserResponseSchema,
  ListOwnedRoomsResponseSchema,
  UpdateRoomRequestSchema,
  UpdateRoomResponseSchema,
} from '@livepulse/contracts';
import type { CurrentUserResponse, Room } from '@livepulse/contracts';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { ClientApiError, clientApiRequest } from '../../lib/client-api';
import { nextRoomStatus, replaceRoom, roomActionLabel } from '../../lib/studio';

type StudioState = 'forbidden' | 'loading' | 'ready' | 'signed-out';
type Notice = { kind: 'error' | 'success'; message: string } | undefined;

export function StudioDashboard() {
  const [state, setState] = useState<StudioState>('loading');
  const [user, setUser] = useState<CurrentUserResponse['user']>();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>();

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

      const owned = await clientApiRequest(
        '/api/v1/rooms/mine',
        ListOwnedRoomsResponseSchema,
      );
      setUser(current.user);
      setRooms(owned.items);
      setSelectedId((currentId) => currentId ?? owned.items[0]?.id);
      setState('ready');
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 401) {
        setState('signed-out');
        return;
      }

      setNotice({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'The studio could not load.',
      });
      setState('ready');
    }
  }

  useEffect(() => {
    void loadStudio();
  }, []);

  const selectedRoom = rooms.find((room) => room.id === selectedId);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setNotice(undefined);

    const form = new FormData(formElement);
    const parsed = CreateRoomRequestSchema.safeParse({
      coverImageUrl: form.get('coverImageUrl'),
      demoVideoUrl: form.get('demoVideoUrl'),
      description: form.get('description'),
      title: form.get('title'),
    });

    if (!parsed.success) {
      setNotice({
        kind: 'error',
        message: 'Complete every field and use valid HTTP or HTTPS media URLs.',
      });
      setPending(false);
      return;
    }

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
      setRooms((current) => [response.room, ...current]);
      setSelectedId(response.room.id);
      setNotice({ kind: 'success', message: 'Draft room created.' });
      formElement.reset();
    } catch (error) {
      showMutationError(error);
    } finally {
      setPending(false);
    }
  }

  async function saveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRoom) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const parsed = UpdateRoomRequestSchema.safeParse({
      coverImageUrl: form.get('coverImageUrl'),
      demoVideoUrl: form.get('demoVideoUrl'),
      description: form.get('description'),
      expectedVersion: selectedRoom.version,
      title: form.get('title'),
    });

    if (!parsed.success) {
      setNotice({
        kind: 'error',
        message: 'Complete every field and use valid HTTP or HTTPS media URLs.',
      });
      return;
    }

    await updateRoom(selectedRoom, parsed.data, 'Room details saved.');
  }

  async function transitionRoom(room: Room) {
    const status = nextRoomStatus(room.status);

    if (!status) {
      return;
    }

    await updateRoom(
      room,
      { expectedVersion: room.version, status },
      status === 'LIVE'
        ? 'The room is live and visible to viewers.'
        : 'The broadcast ended and is now available as a replay.',
    );
  }

  async function updateRoom(
    room: Room,
    input: unknown,
    successMessage: string,
  ) {
    setPending(true);
    setNotice(undefined);

    try {
      const response = await clientApiRequest(
        `/api/v1/rooms/${room.id}`,
        UpdateRoomResponseSchema,
        {
          body: JSON.stringify(input),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        },
      );
      setRooms((current) => replaceRoom(current, response.room));
      setNotice({ kind: 'success', message: successMessage });
    } catch (error) {
      showMutationError(error);
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

  function showMutationError(error: unknown) {
    setNotice({
      kind: 'error',
      message:
        error instanceof ClientApiError &&
        error.code === ApiErrorCode.RoomVersionConflict
          ? 'This room changed elsewhere. The newest version has been loaded.'
          : error instanceof Error
            ? error.message
            : 'The room could not be updated.',
    });
  }

  if (state === 'loading') {
    return <StudioMessage eyebrow="Studio" title="Preparing your rooms…" />;
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
      <section className="flex flex-col justify-between gap-6 border-b border-white/8 pb-10 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
            Host studio
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white sm:text-6xl">
            Shape the next live moment.
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-zinc-400">
            Draft the room, refine its story, then move it live when the stage
            is ready.
          </p>
        </div>
        {user ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-5 py-4 text-sm">
            <p className="font-medium text-white">{user.email}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
              {user.role} account
            </p>
          </div>
        ) : null}
      </section>

      {notice ? (
        <p
          className={`mt-8 rounded-2xl border px-5 py-4 text-sm ${
            notice.kind === 'error'
              ? 'border-rose-400/20 bg-rose-400/10 text-rose-200'
              : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200'
          }`}
          role="status"
        >
          {notice.message}
        </p>
      ) : null}

      <div className="mt-10 grid gap-8 xl:grid-cols-[22rem_1fr]">
        <aside className="space-y-8">
          <section className="rounded-[2rem] border border-white/8 bg-white/[0.035] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Your rooms</h2>
              <span className="rounded-full bg-white/7 px-2.5 py-1 text-xs text-zinc-400">
                {rooms.length}
              </span>
            </div>
            <div className="mt-5 space-y-2">
              {rooms.length > 0 ? (
                rooms.map((room) => (
                  <button
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedId === room.id
                        ? 'border-cyan-300/35 bg-cyan-300/8'
                        : 'border-white/7 bg-black/20 hover:border-white/15'
                    }`}
                    key={room.id}
                    onClick={() => {
                      setSelectedId(room.id);
                      setNotice(undefined);
                    }}
                    type="button"
                  >
                    <span className="block truncate font-medium text-white">
                      {room.title}
                    </span>
                    <span className="mt-2 flex items-center justify-between text-xs uppercase tracking-[0.14em]">
                      <span className={statusColor(room.status)}>
                        {room.status}
                      </span>
                      <span className="text-zinc-600">v{room.version}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm leading-6 text-zinc-500">
                  No rooms yet. Create your first draft below.
                </p>
              )}
            </div>
          </section>

          <CreateRoomForm disabled={pending} onSubmit={createRoom} />
        </aside>

        <section>
          {selectedRoom ? (
            <RoomEditor
              disabled={pending}
              key={`${selectedRoom.id}:${selectedRoom.version}`}
              onSubmit={saveRoom}
              onTransition={() => void transitionRoom(selectedRoom)}
              room={selectedRoom}
            />
          ) : (
            <div className="grid min-h-[34rem] place-items-center rounded-[2rem] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
              <div>
                <p className="text-lg font-semibold text-white">
                  Your next room starts as a draft.
                </p>
                <p className="mt-2 text-sm text-zinc-500">
                  Use the creation form to prepare the stage.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CreateRoomForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  return (
    <form
      className="rounded-[2rem] border border-white/8 bg-white/[0.035] p-5"
      onSubmit={onSubmit}
    >
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">
        New draft
      </p>
      <h2 className="mt-2 text-lg font-semibold text-white">Create a room</h2>
      <div className="mt-5 space-y-4">
        <StudioField label="Title" name="title" placeholder="Design critique" />
        <StudioTextArea
          label="Description"
          name="description"
          placeholder="What will the audience experience?"
        />
        <StudioField
          label="Cover image URL"
          name="coverImageUrl"
          placeholder="https://…"
          type="url"
        />
        <StudioField
          label="Demo video URL"
          name="demoVideoUrl"
          placeholder="https://…"
          type="url"
        />
      </div>
      <button
        className="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-50"
        disabled={disabled}
        type="submit"
      >
        Create draft
      </button>
    </form>
  );
}

function RoomEditor({
  disabled,
  onSubmit,
  onTransition,
  room,
}: {
  disabled: boolean;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onTransition(): void;
  room: Room;
}) {
  const actionLabel = roomActionLabel(room.status);
  const immutable = room.status === 'ENDED';

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/8 bg-white/[0.035]">
      <div className="border-b border-white/8 bg-black/20 p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <p
              className={`text-xs font-bold uppercase tracking-[0.2em] ${statusColor(room.status)}`}
            >
              {room.status}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
              {room.title}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Version {room.version} · Room {room.id.slice(0, 8)}
            </p>
          </div>
          {actionLabel ? (
            <button
              className={`rounded-full px-5 py-3 text-sm font-bold transition disabled:cursor-wait disabled:opacity-50 ${
                room.status === 'DRAFT'
                  ? 'bg-cyan-300 text-zinc-950 hover:bg-cyan-200'
                  : 'border border-rose-300/25 bg-rose-300/10 text-rose-100 hover:bg-rose-300/15'
              }`}
              disabled={disabled}
              onClick={onTransition}
              type="button"
            >
              {actionLabel}
            </button>
          ) : (
            <span className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-400">
              Archived replay
            </span>
          )}
        </div>
      </div>

      <form className="p-6 sm:p-8" onSubmit={onSubmit}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <StudioField
              defaultValue={room.title}
              disabled={immutable}
              label="Title"
              name="title"
            />
            <StudioTextArea
              defaultValue={room.description}
              disabled={immutable}
              label="Description"
              name="description"
            />
          </div>
          <div className="space-y-5">
            <StudioField
              defaultValue={room.coverImageUrl}
              disabled={immutable}
              label="Cover image URL"
              name="coverImageUrl"
              type="url"
            />
            <StudioField
              defaultValue={room.demoVideoUrl}
              disabled={immutable}
              label="Demo video URL"
              name="demoVideoUrl"
              type="url"
            />
          </div>
        </div>
        <div className="mt-8 flex flex-col justify-between gap-4 border-t border-white/8 pt-6 sm:flex-row sm:items-center">
          <p className="max-w-xl text-sm leading-6 text-zinc-500">
            {immutable
              ? 'Ended rooms are preserved as immutable replay records.'
              : 'Saving checks the server version first, protecting newer edits from being overwritten.'}
          </p>
          {!immutable ? (
            <button
              className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-50"
              disabled={disabled}
              type="submit"
            >
              Save changes
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function StudioField({
  defaultValue,
  disabled = false,
  label,
  name,
  placeholder,
  type = 'text',
}: {
  defaultValue?: string;
  disabled?: boolean;
  label: string;
  name: string;
  placeholder?: string;
  type?: 'text' | 'url';
}) {
  return (
    <label className="block text-sm font-medium text-zinc-300">
      {label}
      <input
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:text-zinc-500"
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
        placeholder={placeholder}
        required
        type={type}
      />
    </label>
  );
}

function StudioTextArea({
  defaultValue,
  disabled = false,
  label,
  name,
  placeholder,
}: {
  defaultValue?: string;
  disabled?: boolean;
  label: string;
  name: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm font-medium text-zinc-300">
      {label}
      <textarea
        className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:text-zinc-500"
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
        placeholder={placeholder}
        required
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
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
          {eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white">
          {title}
        </h1>
        {actionHref && actionLabel ? (
          <Link
            className="mt-8 inline-flex rounded-full bg-white px-6 py-3 font-bold text-zinc-950 transition hover:bg-cyan-200"
            href={actionHref}
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function statusColor(status: Room['status']): string {
  if (status === 'LIVE') {
    return 'text-emerald-300';
  }

  if (status === 'ENDED') {
    return 'text-zinc-500';
  }

  return 'text-amber-300';
}
