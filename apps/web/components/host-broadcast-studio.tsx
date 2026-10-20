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
  createLocalVideoTrack,
} from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { clientApiRequest } from '../lib/client-api';
import {
  broadcastPreviewReady,
  cameraUsesOverlay,
  hasBroadcastVideo,
  mediaDeviceLabel,
} from '../lib/livekit-broadcast';
import { LiveKitVideo } from './livekit-media';

interface PreviewTracks {
  camera?: LocalVideoTrack;
  screen?: LocalVideoTrack;
}

type CaptureTarget = 'camera' | 'screen' | undefined;

export function HostBroadcastStudio({
  disabled,
  onEnd,
  onGoLive,
  room,
}: {
  disabled: boolean;
  onEnd(): Promise<boolean>;
  onGoLive(generatedCover?: string): Promise<boolean>;
  room: RoomRecord;
}) {
  const liveKitRoom = useRef<Room | undefined>(undefined);
  const cameraTrack = useRef<LocalVideoTrack | undefined>(undefined);
  const screenTracks = useRef<LocalTrack[]>([]);
  const [previewTracks, setPreviewTracks] = useState<PreviewTracks>({});
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
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget>();
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
    } catch (caught) {
      setError(mediaErrorMessage(caught));
    }
  }, []);

  const stopLocalMedia = useCallback((updatePreview = true) => {
    const activeCamera = cameraTrack.current;
    const activeScreenTracks = screenTracks.current;
    cameraTrack.current = undefined;
    screenTracks.current = [];

    activeCamera?.stop();
    for (const track of activeScreenTracks) {
      track.stop();
    }

    if (updatePreview) {
      setPreviewTracks({});
    }
  }, []);

  const disconnect = useCallback(
    async (stopMedia = true) => {
      const current = liveKitRoom.current;
      liveKitRoom.current = undefined;

      if (current) {
        await current.disconnect();
      }

      if (stopMedia) {
        stopLocalMedia();
      }

      setConnection(ConnectionState.Disconnected);
    },
    [stopLocalMedia],
  );

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
      const activeRoom = liveKitRoom.current;
      liveKitRoom.current = undefined;
      void activeRoom?.disconnect();
      stopLocalMedia(false);
    };
  }, [loadDevices, stopLocalMedia]);

  useEffect(() => {
    if (room.status === 'ENDED') {
      void disconnect();
    }
  }, [disconnect, room.status]);

  async function chooseScreen() {
    setCaptureTarget('screen');
    setError(undefined);

    try {
      // This call must happen directly from the click gesture so the browser
      // is allowed to open its screen picker.
      const nextTracks = await createLocalScreenTracks({
        audio: true,
        contentHint: 'detail',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: 'include',
      });
      const nextVideo = nextTracks.find(
        (track): track is LocalVideoTrack =>
          track.kind === Track.Kind.Video &&
          track.source === Track.Source.ScreenShare,
      );

      if (!nextVideo) {
        throw new Error('The selected source did not provide a video track.');
      }

      const currentRoom = liveKitRoom.current;
      const previousTracks = screenTracks.current;

      if (currentRoom && connection === ConnectionState.Connected) {
        for (const track of previousTracks) {
          await currentRoom.localParticipant.unpublishTrack(track, false);
        }
        for (const track of nextTracks) {
          await currentRoom.localParticipant.publishTrack(track, {
            source: track.source,
          });
        }
      }

      screenTracks.current = nextTracks;

      for (const track of previousTracks) {
        track.stop();
      }

      setScreenEnabled(true);
      setPreviewTracks((current) => ({ ...current, screen: nextVideo }));
      watchScreenEnd(nextVideo);
    } catch (caught) {
      setError(mediaErrorMessage(caught));
    } finally {
      setCaptureTarget(undefined);
    }
  }

  function watchScreenEnd(track: LocalVideoTrack) {
    track.mediaStreamTrack.addEventListener(
      'ended',
      () => {
        if (
          !screenTracks.current.some(
            (candidate) =>
              candidate.mediaStreamTrack.id === track.mediaStreamTrack.id,
          )
        ) {
          return;
        }

        const activeTracks = screenTracks.current;
        screenTracks.current = [];
        for (const candidate of activeTracks) {
          candidate.stop();
        }
        setPreviewTracks((current) => ({ camera: current.camera }));
        setError('Screen sharing stopped. Choose a screen again to continue.');
      },
      { once: true },
    );
  }

  async function prepareCamera(deviceId = videoDeviceId) {
    setCaptureTarget('camera');
    setError(undefined);

    try {
      const currentRoom = liveKitRoom.current;

      if (
        currentRoom &&
        connection === ConnectionState.Connected &&
        cameraTrack.current
      ) {
        if (deviceId) {
          await currentRoom.switchActiveDevice('videoinput', deviceId);
        }
        setCameraEnabled(true);
        setPreviewTracks((current) => ({
          ...current,
          camera: cameraTrack.current,
        }));
        return;
      }

      const nextTrack = await createLocalVideoTrack({
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      });
      const previousTrack = cameraTrack.current;

      if (currentRoom && connection === ConnectionState.Connected) {
        await currentRoom.localParticipant.publishTrack(nextTrack, {
          source: Track.Source.Camera,
        });
      }

      previousTrack?.stop();
      cameraTrack.current = nextTrack;
      setCameraEnabled(true);
      setPreviewTracks((current) => ({ ...current, camera: nextTrack }));
      await loadDevices(false);
    } catch (caught) {
      setCameraEnabled(false);
      setError(mediaErrorMessage(caught));
    } finally {
      setCaptureTarget(undefined);
    }
  }

  async function disableCamera() {
    const track = cameraTrack.current;
    const currentRoom = liveKitRoom.current;

    if (track && currentRoom && connection === ConnectionState.Connected) {
      await currentRoom.localParticipant.unpublishTrack(track, false);
    }

    track?.stop();
    cameraTrack.current = undefined;
    setCameraEnabled(false);
    setPreviewTracks((current) => ({ screen: current.screen }));
  }

  async function disableScreen() {
    const currentRoom = liveKitRoom.current;

    if (currentRoom && connection === ConnectionState.Connected) {
      for (const track of screenTracks.current) {
        await currentRoom.localParticipant.unpublishTrack(track, false);
      }
    }

    const activeTracks = screenTracks.current;
    screenTracks.current = [];
    for (const track of activeTracks) {
      track.stop();
    }
    setScreenEnabled(false);
    setPreviewTracks((current) => ({ camera: current.camera }));
  }

  async function startBroadcast() {
    if (!hasBroadcastVideo({ camera: cameraEnabled, screen: screenEnabled })) {
      setError('Choose screen sharing, camera, or both before going live.');
      return;
    }

    if (screenEnabled && !previewTracks.screen) {
      setError('Choose a screen and confirm its preview before going live.');
      return;
    }

    if (cameraEnabled && !previewTracks.camera) {
      setError('Wait for the camera preview before going live.');
      return;
    }

    const mainTrack = previewTracks.screen ?? previewTracks.camera;

    if (!mainTrack) {
      setError('Prepare at least one video source before going live.');
      return;
    }

    setPending(true);
    setError(undefined);
    let connectingRoom: Room | undefined;
    let mediaWasPublished = false;

    try {
      const generatedCover = room.coverImageUrl
        ? undefined
        : await captureVideoFrame(mainTrack).catch(() => undefined);
      const credentials = await clientApiRequest(
        `/api/v1/rooms/${room.id}/broadcast/host-token`,
        BroadcastConnectionResponseSchema,
        { method: 'POST' },
      );
      connectingRoom = new Room({ adaptiveStream: true, dynacast: true });
      connectingRoom.on(RoomEvent.ConnectionStateChanged, setConnection);
      liveKitRoom.current = connectingRoom;

      await connectingRoom.connect(
        credentials.serverUrl,
        credentials.participantToken,
      );

      for (const track of screenTracks.current) {
        await connectingRoom.localParticipant.publishTrack(track, {
          source: track.source,
        });
        mediaWasPublished = true;
      }

      if (cameraTrack.current) {
        await connectingRoom.localParticipant.publishTrack(
          cameraTrack.current,
          { source: Track.Source.Camera },
        );
        mediaWasPublished = true;
      }

      if (microphoneEnabled) {
        await connectingRoom.localParticipant.setMicrophoneEnabled(true, {
          ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
        });
      }

      await loadDevices(false);

      if (!(await onGoLive(generatedCover))) {
        throw new Error('The room could not be moved live.');
      }
    } catch (caught) {
      liveKitRoom.current = undefined;
      await connectingRoom?.disconnect();

      if (mediaWasPublished) {
        stopLocalMedia();
      }

      setConnection(ConnectionState.Disconnected);
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

    try {
      if (current && connection === ConnectionState.Connected && id) {
        await current.switchActiveDevice(kind, id);
      } else if (kind === 'videoinput' && cameraEnabled) {
        await prepareCamera(id);
      }
    } catch (caught) {
      setError(mediaErrorMessage(caught));
    }
  }

  const connected = connection === ConnectionState.Connected;
  const mainTrack = previewTracks.screen ?? previewTracks.camera;
  const cameraOverlay = previewTracks.screen ? previewTracks.camera : undefined;
  const previewReady = broadcastPreviewReady(
    { camera: cameraEnabled, screen: screenEnabled },
    {
      camera: Boolean(previewTracks.camera),
      screen: Boolean(previewTracks.screen),
    },
  );

  return (
    <section className="border-b border-white/8 p-6 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
            Broadcast setup
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Prepare and verify your local preview before viewers can see it.
          </p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300">
          {hostConnectionLabel(connection, previewReady)}
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
            <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.08),transparent_55%)] px-8 text-center">
              <div>
                <p className="text-sm font-semibold text-white">
                  Select a source to start the local preview
                </p>
                <p className="mt-2 max-w-sm text-xs leading-5 text-zinc-500">
                  Nothing is sent to viewers until you confirm this preview and
                  start the broadcast.
                </p>
                {screenEnabled ? (
                  <button
                    className="mt-5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200 disabled:opacity-50"
                    disabled={captureTarget !== undefined || pending}
                    onClick={() => void chooseScreen()}
                    type="button"
                  >
                    {captureTarget === 'screen'
                      ? 'Opening screen picker…'
                      : 'Choose a screen'}
                  </button>
                ) : null}
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

          {previewReady && !connected ? (
            <span className="absolute bottom-4 left-4 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 backdrop-blur">
              Local preview · not live
            </span>
          ) : null}
        </div>

        <div className="space-y-5 border-t border-white/10 bg-[#101116] p-5 xl:border-l xl:border-t-0">
          <SourceToggle
            checked={screenEnabled}
            label="Share screen"
            onChange={(checked) =>
              void (checked ? chooseScreen() : disableScreen())
            }
          />
          {screenEnabled ? (
            <button
              className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-cyan-300/40 hover:text-cyan-200 disabled:opacity-50"
              disabled={captureTarget !== undefined || pending}
              onClick={() => void chooseScreen()}
              type="button"
            >
              {previewTracks.screen ? 'Change shared screen' : 'Choose screen'}
            </button>
          ) : null}
          <SourceToggle
            checked={cameraEnabled}
            label="Use camera"
            onChange={(checked) =>
              void (checked ? prepareCamera() : disableCamera())
            }
          />
          <DeviceSelect
            disabled={!cameraEnabled || captureTarget === 'camera'}
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
            disabled={pending || captureTarget !== undefined}
            onClick={() => void loadDevices(true)}
            type="button"
          >
            Refresh input devices
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
                className="w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={
                  disabled ||
                  pending ||
                  captureTarget !== undefined ||
                  !previewReady ||
                  room.status === 'ENDED'
                }
                onClick={() => void startBroadcast()}
                type="button"
              >
                {pending
                  ? 'Starting…'
                  : room.status === 'LIVE'
                    ? 'Reconnect broadcast'
                    : 'Start live broadcast'}
              </button>
              {!previewReady ? (
                <p className="text-center text-[0.7rem] leading-5 text-zinc-500">
                  Prepare a screen or camera preview first.
                </p>
              ) : null}
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

async function captureVideoFrame(track: LocalVideoTrack): Promise<string> {
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  track.attach(video);

  try {
    await video.play();

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error('The preview frame was not ready in time.')),
          3_000,
        );
        video.addEventListener(
          'loadeddata',
          () => {
            window.clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
      });
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;

    if (sourceWidth === 0 || sourceHeight === 0) {
      throw new Error('The preview did not produce a frame for the cover.');
    }

    const width = Math.min(640, sourceWidth);
    const height = Math.round((sourceHeight / sourceWidth) * width);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('The browser could not create a cover image.');
    }

    context.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.76);
  } finally {
    track.detach(video);
  }
}

function hostConnectionLabel(
  connection: ConnectionState,
  previewReady: boolean,
): string {
  if (connection === ConnectionState.Connected) {
    return 'On air';
  }

  if (connection === ConnectionState.Connecting) {
    return 'Connecting';
  }

  if (connection === ConnectionState.Reconnecting) {
    return 'Reconnecting';
  }

  return previewReady ? 'Preview ready' : 'Setup required';
}

function mediaErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Camera, microphone, or screen permission was not granted.';
  }

  return error instanceof Error
    ? error.message
    : 'The broadcast media could not be prepared.';
}
