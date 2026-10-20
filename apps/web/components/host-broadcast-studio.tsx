'use client';

import { BroadcastConnectionResponseSchema } from '@livepulse/contracts';
import type { Room as RoomRecord } from '@livepulse/contracts';
import {
  ConnectionState,
  type LocalTrack,
  type LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  createLocalScreenTracks,
} from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { clientApiRequest } from '../lib/client-api';
import {
  cameraUsesOverlay,
  hasBroadcastVideo,
  mediaDeviceLabel,
} from '../lib/livekit-broadcast';
import { LiveKitVideo } from './livekit-media';

interface HostTracks {
  camera?: LocalVideoTrack;
  screen?: LocalVideoTrack;
}

export function HostBroadcastStudio({
  disabled,
  onEnd,
  onGoLive,
  room,
}: {
  disabled: boolean;
  onEnd(): Promise<boolean>;
  onGoLive(): Promise<boolean>;
  room: RoomRecord;
}) {
  const liveKitRoom = useRef<Room | undefined>(undefined);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState('');
  const [videoDeviceId, setVideoDeviceId] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [connection, setConnection] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [tracks, setTracks] = useState<HostTracks>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const loadDevices = useCallback(async (requestPermissions: boolean) => {
    try {
      const devices = await Room.getLocalDevices(undefined, requestPermissions);
      const microphones = devices.filter(
        (device) => device.kind === 'audioinput',
      );
      const cameras = devices.filter((device) => device.kind === 'videoinput');

      setAudioDevices(microphones);
      setVideoDevices(cameras);
      setAudioDeviceId((current) => current || microphones[0]?.deviceId || '');
      setVideoDeviceId((current) => current || cameras[0]?.deviceId || '');
      setError(undefined);
    } catch (caught) {
      setError(mediaErrorMessage(caught));
    }
  }, []);

  const disconnect = useCallback(async () => {
    const current = liveKitRoom.current;
    liveKitRoom.current = undefined;

    if (current) {
      await current.disconnect();
    }

    setTracks({});
    setConnection(ConnectionState.Disconnected);
  }, []);

  useEffect(() => {
    void loadDevices(false);

    const handleDeviceChange = () => void loadDevices(false);
    navigator.mediaDevices?.addEventListener(
      'devicechange',
      handleDeviceChange,
    );

    return () => {
      navigator.mediaDevices?.removeEventListener(
        'devicechange',
        handleDeviceChange,
      );
      void disconnect();
    };
  }, [disconnect, loadDevices]);

  useEffect(() => {
    if (room.status === 'ENDED') {
      void disconnect();
    }
  }, [disconnect, room.status]);

  async function startBroadcast() {
    if (!hasBroadcastVideo({ camera: cameraEnabled, screen: screenEnabled })) {
      setError('Choose screen sharing, camera, or both before going live.');
      return;
    }

    setPending(true);
    setError(undefined);
    let capturedScreenTracks: LocalTrack[] = [];
    let connectingRoom: Room | undefined;

    try {
      // Capture the screen before any network await so the browser still treats
      // the chooser as part of the host's click gesture.
      if (screenEnabled) {
        capturedScreenTracks = await createLocalScreenTracks({
          audio: true,
          contentHint: 'detail',
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include',
          systemAudio: 'include',
        });
      }

      const credentials = await clientApiRequest(
        `/api/v1/rooms/${room.id}/broadcast/host-token`,
        BroadcastConnectionResponseSchema,
        { method: 'POST' },
      );
      connectingRoom = new Room({ adaptiveStream: true, dynacast: true });
      const refreshTracks = () =>
        setTracks(collectHostTracks(connectingRoom as Room));

      connectingRoom
        .on(RoomEvent.LocalTrackPublished, refreshTracks)
        .on(RoomEvent.LocalTrackUnpublished, refreshTracks)
        .on(RoomEvent.TrackMuted, refreshTracks)
        .on(RoomEvent.TrackUnmuted, refreshTracks)
        .on(RoomEvent.ConnectionStateChanged, setConnection);

      liveKitRoom.current = connectingRoom;
      await connectingRoom.connect(
        credentials.serverUrl,
        credentials.participantToken,
      );

      for (const track of capturedScreenTracks) {
        await connectingRoom.localParticipant.publishTrack(track, {
          source: track.source,
        });
      }

      if (microphoneEnabled) {
        await connectingRoom.localParticipant.setMicrophoneEnabled(true, {
          ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
        });
      }

      if (cameraEnabled) {
        await connectingRoom.localParticipant.setCameraEnabled(true, {
          ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {}),
        });
      }

      refreshTracks();
      await loadDevices(false);

      if (room.status === 'DRAFT' && !(await onGoLive())) {
        throw new Error('The room could not be moved live.');
      }
    } catch (caught) {
      for (const track of capturedScreenTracks) {
        track.stop();
      }
      await disconnect();
      setError(mediaErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function endBroadcast() {
    setPending(true);
    setError(undefined);

    try {
      if (await onEnd()) {
        await disconnect();
      }
    } finally {
      setPending(false);
    }
  }

  async function toggleCamera(enabled: boolean) {
    if (!enabled && !screenEnabled) {
      setError('Keep at least one video source enabled.');
      return;
    }

    const current = liveKitRoom.current;
    setCameraEnabled(enabled);
    setError(undefined);

    if (!current || connection !== ConnectionState.Connected) {
      return;
    }

    try {
      await current.localParticipant.setCameraEnabled(enabled, {
        ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {}),
      });
      setTracks(collectHostTracks(current));
    } catch (caught) {
      setCameraEnabled(!enabled);
      setError(mediaErrorMessage(caught));
    }
  }

  async function toggleScreen(enabled: boolean) {
    if (!enabled && !cameraEnabled) {
      setError('Keep at least one video source enabled.');
      return;
    }

    const current = liveKitRoom.current;
    setScreenEnabled(enabled);
    setError(undefined);

    if (!current || connection !== ConnectionState.Connected) {
      return;
    }

    try {
      await current.localParticipant.setScreenShareEnabled(enabled, {
        audio: true,
        contentHint: 'detail',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: 'include',
      });
      setTracks(collectHostTracks(current));
    } catch (caught) {
      setScreenEnabled(!enabled);
      setError(mediaErrorMessage(caught));
    }
  }

  async function toggleMicrophone(enabled: boolean) {
    const current = liveKitRoom.current;
    setMicrophoneEnabled(enabled);
    setError(undefined);

    if (!current || connection !== ConnectionState.Connected) {
      return;
    }

    try {
      await current.localParticipant.setMicrophoneEnabled(enabled, {
        ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
      });
    } catch (caught) {
      setMicrophoneEnabled(!enabled);
      setError(mediaErrorMessage(caught));
    }
  }

  async function selectDevice(kind: 'audioinput' | 'videoinput', id: string) {
    if (kind === 'audioinput') {
      setAudioDeviceId(id);
    } else {
      setVideoDeviceId(id);
    }

    const current = liveKitRoom.current;

    if (!current || connection !== ConnectionState.Connected || !id) {
      return;
    }

    try {
      await current.switchActiveDevice(kind, id);
    } catch (caught) {
      setError(mediaErrorMessage(caught));
    }
  }

  const connected = connection === ConnectionState.Connected;
  const mainTrack = tracks.screen ?? tracks.camera;
  const cameraOverlay = tracks.screen ? tracks.camera : undefined;

  return (
    <section className="border-b border-white/8 p-6 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
            Broadcast controls
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Share your screen, camera, or both. The camera stays at the top
            right when both are active.
          </p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300">
          {hostConnectionLabel(connection)}
        </span>
      </div>

      <div className="grid overflow-hidden rounded-3xl border border-white/10 bg-black xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="relative aspect-video min-h-64 bg-zinc-950">
          {mainTrack ? (
            <LiveKitVideo
              className="h-full w-full object-contain"
              muted
              track={mainTrack}
            />
          ) : (
            <div className="grid h-full place-items-center px-8 text-center">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5 text-2xl">
                  ◫
                </div>
                <p className="mt-4 text-sm font-semibold text-white">
                  Your live preview appears here
                </p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  Screen sharing opens the browser source picker when you start.
                </p>
              </div>
            </div>
          )}

          {cameraOverlay &&
          cameraUsesOverlay({ camera: true, screen: true }) ? (
            <div className="absolute right-4 top-4 aspect-video w-[28%] min-w-28 max-w-64 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl shadow-black/60">
              <LiveKitVideo
                className="h-full w-full object-cover"
                muted
                track={cameraOverlay}
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-5 border-t border-white/10 bg-[#101116] p-5 xl:border-l xl:border-t-0">
          <SourceToggle
            checked={screenEnabled}
            label="Share screen"
            onChange={(checked) => void toggleScreen(checked)}
          />
          <SourceToggle
            checked={cameraEnabled}
            label="Use camera"
            onChange={(checked) => void toggleCamera(checked)}
          />
          <DeviceSelect
            disabled={!cameraEnabled}
            fallback="Camera"
            label="Camera input"
            onChange={(id) => void selectDevice('videoinput', id)}
            options={videoDevices}
            value={videoDeviceId}
          />
          <SourceToggle
            checked={microphoneEnabled}
            label="Use microphone"
            onChange={(checked) => void toggleMicrophone(checked)}
          />
          <DeviceSelect
            disabled={!microphoneEnabled}
            fallback="Microphone"
            label="Microphone input"
            onChange={(id) => void selectDevice('audioinput', id)}
            options={audioDevices}
            value={audioDeviceId}
          />

          <button
            className="w-full rounded-2xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:border-cyan-300/40 hover:text-cyan-200 disabled:opacity-50"
            disabled={pending}
            onClick={() => void loadDevices(true)}
            type="button"
          >
            Allow / refresh devices
          </button>

          {connected ? (
            <button
              className="w-full rounded-2xl bg-rose-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-400 disabled:cursor-wait disabled:opacity-50"
              disabled={disabled || pending}
              onClick={() => void endBroadcast()}
              type="button"
            >
              End broadcast
            </button>
          ) : (
            <div className="space-y-2">
              <button
                className="w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-50"
                disabled={disabled || pending || room.status === 'ENDED'}
                onClick={() => void startBroadcast()}
                type="button"
              >
                {pending
                  ? 'Starting…'
                  : room.status === 'LIVE'
                    ? 'Reconnect broadcast'
                    : 'Start live broadcast'}
              </button>
              {room.status === 'LIVE' ? (
                <button
                  className="w-full rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-100 transition hover:bg-rose-300/15 disabled:cursor-wait disabled:opacity-50"
                  disabled={disabled || pending}
                  onClick={() => void endBroadcast()}
                  type="button"
                >
                  End broadcast
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {error ? (
        <p
          className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
          role="status"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function SourceToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm font-medium text-zinc-200">
      {label}
      <input
        checked={checked}
        className="h-4 w-4 accent-cyan-300"
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
    </label>
  );
}

function DeviceSelect({
  disabled,
  fallback,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  fallback: 'Camera' | 'Microphone';
  label: string;
  onChange(value: string): void;
  options: MediaDeviceInfo[];
  value: string;
}) {
  return (
    <label className="block text-xs font-semibold text-zinc-400">
      {label}
      <select
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none disabled:opacity-40"
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.length === 0 ? <option value="">System default</option> : null}
        {options.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {mediaDeviceLabel(device, index, fallback)}
          </option>
        ))}
      </select>
    </label>
  );
}

function collectHostTracks(room: Room): HostTracks {
  const camera = room.localParticipant.getTrackPublication(
    Track.Source.Camera,
  )?.videoTrack;
  const screen = room.localParticipant.getTrackPublication(
    Track.Source.ScreenShare,
  )?.videoTrack;

  return {
    ...(camera && !camera.isMuted ? { camera: camera as LocalVideoTrack } : {}),
    ...(screen && !screen.isMuted ? { screen: screen as LocalVideoTrack } : {}),
  };
}

function hostConnectionLabel(connection: ConnectionState): string {
  if (connection === ConnectionState.Connected) {
    return 'On air';
  }

  if (connection === ConnectionState.Connecting) {
    return 'Connecting';
  }

  if (connection === ConnectionState.Reconnecting) {
    return 'Reconnecting';
  }

  return 'Not connected';
}

function mediaErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Camera, microphone, or screen permission was not granted.';
  }

  return error instanceof Error
    ? error.message
    : 'The broadcast media could not be started.';
}
