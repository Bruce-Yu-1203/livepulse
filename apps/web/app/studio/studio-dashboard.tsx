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
import { AuthEntryLink } from '../../components/auth-dialog-provider';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { HostBroadcastStudio } from '../../components/host-broadcast-studio';
import { ClientApiError, clientApiRequest } from '../../lib/client-api';
import { replaceRoom } from '../../lib/studio';

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
    const reloadAfterSignIn = () => void loadStudio();
    window.addEventListener('livepulse:auth-changed', reloadAfterSignIn);
    return () =>
      window.removeEventListener('livepulse:auth-changed', reloadAfterSignIn);
  }, []);

  const selectedRoom = rooms.find((room) => room.id === selectedId);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setNotice(undefined);

    const form = new FormData(formElement);
    const parsed = CreateRoomRequestSchema.safeParse({
      description: form.get('description'),
      title: form.get('title'),
    });

    if (!parsed.success) {
      setNotice({
        kind: 'error',
        message: 'Add a title and description before creating the room.',
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
      description: form.get('description'),
      expectedVersion: selectedRoom.version,
      title: form.get('title'),
    });

    if (!parsed.success) {
      setNotice({
        kind: 'error',
        message: 'Add a title and description before saving the room.',
      });
      return;
    }

    await updateRoom(selectedRoom, parsed.data, 'Room details saved.');
  }

  async function transitionRoom(
    room: Room,
    status: 'ENDED' | 'LIVE',
  ): Promise<boolean> {
    const updated = await updateRoom(
      room,
      { expectedVersion: room.version, status },
      status === 'LIVE'
        ? 'The room is live and visible to viewers.'
        : 'The broadcast ended and the room is now archived.',
    );

    return updated !== undefined;
  }

  async function markBroadcastReady(
    room: Room,
    generatedCover?: string,
  ): Promise<boolean> {
    if (room.status === 'LIVE' && !generatedCover) {
      return true;
    }

    const updated = await updateRoom(
      room,
      {
        ...(generatedCover ? { coverImageUrl: generatedCover } : {}),
        expectedVersion: room.version,
        ...(room.status === 'DRAFT' ? { status: 'LIVE' as const } : {}),
      },
      room.status === 'DRAFT'
        ? 'The room is live and visible to viewers.'
        : 'The broadcast preview was refreshed.',
    );

    return updated !== undefined;
  }

  async function updateRoom(
    room: Room,
    input: unknown,
    successMessage: string,
  ): Promise<Room | undefined> {
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
      return response.room;
    } catch (error) {
      showMutationError(error);
      if (
        error instanceof ClientApiError &&
        error.code === ApiErrorCode.RoomVersionConflict
      ) {
        await loadStudio();
      }
      return undefined;
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
      <section className="flex flex-col justify-between gap-6 border-b border-fg/8 pb-10 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold text-accent">Host studio</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-fg sm:text-6xl">
            Shape the next live moment.
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted">
            Draft the room, refine its story, then move it live when the stage
            is ready.
          </p>
        </div>
        {user ? (
          <div className="rounded-2xl border border-fg/8 bg-fg/[0.035] px-5 py-4 text-sm">
            <p className="font-medium text-fg">{user.email}</p>
            <p className="mt-1 text-xs text-muted">{user.role} account</p>
          </div>
        ) : null}
      </section>

      {notice ? (
        <p
          className={`mt-8 rounded-2xl border px-5 py-4 text-sm ${
            notice.kind === 'error'
              ? 'border-danger/20 bg-danger/10 text-danger'
              : 'border-success/20 bg-success/10 text-success'
          }`}
          role="status"
        >
          {notice.message}
        </p>
      ) : null}

      <div className="mt-10 grid gap-8 xl:grid-cols-[22rem_1fr]">
        <aside className="space-y-8">
          <section className="rounded-[2rem] border border-fg/8 bg-fg/[0.035] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-fg">Your rooms</h2>
              <span className="rounded-full bg-fg/7 px-2.5 py-1 text-xs text-muted">
                {rooms.length}
              </span>
            </div>
            <div className="mt-5 space-y-2">
              {rooms.length > 0 ? (
                rooms.map((room) => (
                  <button
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedId === room.id
                        ? 'border-accent/35 bg-accent/8'
                        : 'border-fg/7 bg-sunken hover:border-fg/15'
                    }`}
                    key={room.id}
                    onClick={() => {
                      setSelectedId(room.id);
                      setNotice(undefined);
                    }}
                    type="button"
                  >
                    <span className="block truncate font-medium text-fg">
                      {room.title}
                    </span>
                    <span className="mt-2 flex items-center justify-between text-xs">
                      <span className={statusColor(room.status)}>
                        {room.status}
                      </span>
                      <span className="text-subtle">v{room.version}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-fg/10 px-4 py-8 text-center text-sm leading-6 text-muted">
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
              key={selectedRoom.id}
              onEnd={() => transitionRoom(selectedRoom, 'ENDED')}
              onGoLive={(generatedCover) =>
                markBroadcastReady(selectedRoom, generatedCover)
              }
              onSubmit={saveRoom}
              room={selectedRoom}
            />
          ) : (
            <div className="grid min-h-[34rem] place-items-center rounded-[2rem] border border-dashed border-fg/10 bg-fg/[0.02] p-8 text-center">
              <div>
                <p className="text-lg font-semibold text-fg">
                  Your next room starts as a draft.
                </p>
                <p className="mt-2 text-sm text-muted">
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
      className="rounded-[2rem] border border-fg/8 bg-fg/[0.035] p-5"
      onSubmit={onSubmit}
    >
      <p className="text-xs font-bold text-accent">New draft</p>
      <h2 className="mt-2 text-lg font-semibold text-fg">Create a room</h2>
      <div className="mt-5 space-y-4">
        <StudioField label="Title" name="title" placeholder="Design critique" />
        <StudioTextArea
          label="Description"
          name="description"
          placeholder="What will the audience experience?"
        />
      </div>
      <button
        className="mt-5 w-full rounded-2xl bg-fg px-4 py-3 text-sm font-bold text-canvas transition hover:bg-accent disabled:cursor-wait disabled:opacity-50 hover:text-on-accent"
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
  onEnd,
  onGoLive,
  onSubmit,
  room,
}: {
  disabled: boolean;
  onEnd(): Promise<boolean>;
  onGoLive(generatedCover?: string): Promise<boolean>;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  room: Room;
}) {
  const immutable = room.status === 'ENDED';

  return (
    <div className="overflow-hidden rounded-[2rem] border border-fg/8 bg-fg/[0.035]">
      <div className="border-b border-fg/8 bg-sunken p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <p className={`text-xs font-bold ${statusColor(room.status)}`}>
              {room.status}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-fg">
              {room.title}
            </h2>
            <p className="mt-2 text-sm text-muted">
              Version {room.version} · Room {room.id.slice(0, 8)}
            </p>
          </div>
          {immutable ? (
            <span className="rounded-full border border-fg/10 px-4 py-2 text-xs font-semibold text-muted">
              Broadcast ended
            </span>
          ) : null}
        </div>
      </div>

      {!immutable ? (
        <HostBroadcastStudio
          disabled={disabled}
          onEnd={onEnd}
          onGoLive={onGoLive}
          room={room}
        />
      ) : null}

      <form className="p-6 sm:p-8" onSubmit={onSubmit}>
        <div className="grid gap-6 lg:grid-cols-2">
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
        <div className="mt-8 flex flex-col justify-between gap-4 border-t border-fg/8 pt-6 sm:flex-row sm:items-center">
          <p className="max-w-xl text-sm leading-6 text-muted">
            {immutable
              ? 'Ended rooms are preserved as immutable broadcast records.'
              : 'Saving checks the server version first, protecting newer edits from being overwritten.'}
          </p>
          {!immutable ? (
            <button
              className="rounded-full border border-fg/15 px-5 py-3 text-sm font-semibold text-fg transition hover:border-accent/40 hover:text-accent disabled:cursor-wait disabled:opacity-50"
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
    <label className="block text-sm font-medium text-fg-soft">
      {label}
      <input
        className="mt-2 w-full rounded-2xl border border-fg/10 bg-sunken px-4 py-3 text-fg outline-none transition placeholder:text-subtle focus:border-accent/50 focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:text-muted"
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
    <label className="block text-sm font-medium text-fg-soft">
      {label}
      <textarea
        className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-fg/10 bg-sunken px-4 py-3 text-fg outline-none transition placeholder:text-subtle focus:border-accent/50 focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:text-muted"
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

function statusColor(status: Room['status']): string {
  if (status === 'LIVE') {
    return 'text-success';
  }

  if (status === 'ENDED') {
    return 'text-muted';
  }

  return 'text-warning';
}
