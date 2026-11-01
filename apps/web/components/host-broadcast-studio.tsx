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
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { formatBroadcastDuration } from '../lib/broadcast-duration';
import {
  BROADCAST_CONTENT_KEY,
  BROADCAST_QUALITY_KEY,
  type BroadcastContent,
  type BroadcastQuality,
  DEFAULT_BROADCAST_CONTENT,
  DEFAULT_BROADCAST_QUALITY,
  type PushHealth,
  type PushSample,
  broadcastContentOptions,
  broadcastContents,
  broadcastQualities,
  broadcastQualityTiers,
  captureConstraints,
  captureResolution,
  formatPushHealth,
  parseBroadcastContent,
  parseBroadcastQuality,
  publishOptionsFor,
  pushHealth,
  pushHealthWarning,
  samplePush,
} from '../lib/broadcast-quality';
import { clientApiRequest } from '../lib/client-api';
import {
  broadcastPreviewReady,
  cameraUsesOverlay,
  hasBroadcastVideo,
  mediaDeviceLabel,
} from '../lib/livekit-broadcast';
import { studioChecklist } from '../lib/studio-checklist';
import { useLeaveStudioGuard } from '../lib/studio-leave-guard';
import { LiveKitVideo } from './livekit-media';
import { StatusNotice } from './status-notice';

interface PreviewTracks {
  camera?: LocalVideoTrack;
  screen?: LocalVideoTrack;
}

type CaptureTarget = 'camera' | 'screen' | undefined;

export function HostBroadcastStudio({
  chat,
  details,
  detailsReady = true,
  disabled,
  onAbort,
  onEnd,
  onGoLive,
  onPrepare,
  onStatusChange,
  room,
}: {
  /** Live chat; when given, the studio switches to its on-air layout. */
  chat?: ReactNode;
  /** Room details form shown above the checklist in the side panel. */
  details?: ReactNode;
  detailsReady?: boolean;
  disabled: boolean;
  onAbort(room: RoomRecord): Promise<void>;
  onEnd(room: RoomRecord): Promise<boolean>;
  onGoLive(room: RoomRecord, generatedCover?: string): Promise<boolean>;
  onPrepare(): Promise<RoomRecord>;
  /** Reports the short status shown in the studio header. */
  onStatusChange?(status: string): void;
  room?: RoomRecord;
}) {
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [now, setNow] = useState(() => Date.now());
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
  const [quality, setQuality] = useState<BroadcastQuality>(
    DEFAULT_BROADCAST_QUALITY,
  );
  const [content, setContent] = useState<BroadcastContent>(
    DEFAULT_BROADCAST_CONTENT,
  );
  const [applyingQuality, setApplyingQuality] = useState(false);
  const [health, setHealth] = useState<PushHealth>();

  // Remember the host's last stream settings on this device.
  useEffect(() => {
    try {
      setQuality(
        parseBroadcastQuality(localStorage.getItem(BROADCAST_QUALITY_KEY)),
      );
      setContent(
        parseBroadcastContent(localStorage.getItem(BROADCAST_CONTENT_KEY)),
      );
    } catch {
      // Storage is unavailable; keep the defaults.
    }
  }, []);

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
    if (room?.status === 'ENDED') {
      void disconnect();
    }
  }, [disconnect, room?.status]);

  async function chooseScreen() {
    setCaptureTarget('screen');
    setError(undefined);

    try {
      // This call must happen directly from the click gesture so the browser
      // is allowed to open its screen picker.
      const nextTracks = await createLocalScreenTracks({
        audio: true,
        contentHint: broadcastContentOptions[content].contentHint,
        resolution: captureResolution(quality),
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
          await currentRoom.localParticipant.publishTrack(
            track,
            publishOptionsFor(track.source, quality, content),
          );
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
        resolution: captureResolution(quality),
      });
      const previousTrack = cameraTrack.current;

      if (currentRoom && connection === ConnectionState.Connected) {
        await currentRoom.localParticipant.publishTrack(
          nextTrack,
          publishOptionsFor(Track.Source.Camera, quality, content),
        );
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
    let preparedRoom: RoomRecord | undefined;
    let activated = false;

    try {
      if (liveKitRoom.current?.state === ConnectionState.Disconnected) {
        await disconnect(false);
      }
      const generatedCover = room?.coverImageUrl
        ? undefined
        : await captureVideoFrame(mainTrack).catch(() => undefined);
      preparedRoom = room ?? (await onPrepare());
      const credentials = await clientApiRequest(
        `/api/v1/rooms/${preparedRoom.id}/broadcast/host-token`,
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
        await connectingRoom.localParticipant.publishTrack(
          track,
          publishOptionsFor(track.source, quality, content),
        );
        mediaWasPublished = true;
      }

      if (cameraTrack.current) {
        await connectingRoom.localParticipant.publishTrack(
          cameraTrack.current,
          publishOptionsFor(Track.Source.Camera, quality, content),
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

      if (!(await onGoLive(preparedRoom, generatedCover))) {
        throw new Error('The room could not be moved live.');
      }
      activated = true;
    } catch (caught) {
      liveKitRoom.current = undefined;
      await connectingRoom?.disconnect();

      if (mediaWasPublished) {
        stopLocalMedia();
      }

      setConnection(ConnectionState.Disconnected);
      if (preparedRoom && !room && !activated) {
        await onAbort(preparedRoom).catch(() => undefined);
      }
      setError(mediaErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function endBroadcast() {
    setPending(true);
    setError(undefined);

    try {
      if (room && (await onEnd(room))) {
        await disconnect();
      }
    } finally {
      setPending(false);
      setConfirmingEnd(false);
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

  async function changeStreamSettings(
    nextQuality: BroadcastQuality,
    nextContent: BroadcastContent,
  ) {
    setQuality(nextQuality);
    setContent(nextContent);
    setError(undefined);

    try {
      localStorage.setItem(BROADCAST_QUALITY_KEY, nextQuality);
      localStorage.setItem(BROADCAST_CONTENT_KEY, nextContent);
    } catch {
      // The choice still applies to this broadcast.
    }

    const videoTracks = [
      ...screenTracks.current.filter(
        (track): track is LocalVideoTrack => track.kind === Track.Kind.Video,
      ),
      ...(cameraTrack.current ? [cameraTrack.current] : []),
    ];

    if (videoTracks.length === 0) {
      return;
    }

    setApplyingQuality(true);

    try {
      for (const track of videoTracks) {
        // Resize the running capture; a device that cannot reach the new
        // size keeps its closest supported one.
        await track.mediaStreamTrack
          .applyConstraints(captureConstraints(nextQuality))
          .catch(() => undefined);

        if (track.source === Track.Source.ScreenShare) {
          track.mediaStreamTrack.contentHint =
            broadcastContentOptions[nextContent].contentHint;
        }
      }

      const currentRoom = liveKitRoom.current;

      if (currentRoom && connection === ConnectionState.Connected) {
        // Encoding settings are fixed at publish time, so republish. Viewers
        // see about a second of the waiting screen.
        for (const track of videoTracks) {
          await currentRoom.localParticipant.unpublishTrack(track, false);
          await currentRoom.localParticipant.publishTrack(
            track,
            publishOptionsFor(track.source, nextQuality, nextContent),
          );
        }
      }
    } catch (caught) {
      setError(mediaErrorMessage(caught));
    } finally {
      setApplyingQuality(false);
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
  const reconnecting =
    connection === ConnectionState.Connecting ||
    connection === ConnectionState.Reconnecting ||
    connection === ConnectionState.SignalReconnecting;
  const mainTrack = previewTracks.screen ?? previewTracks.camera;
  const cameraOverlay = previewTracks.screen ? previewTracks.camera : undefined;
  const previewReady = broadcastPreviewReady(
    { camera: cameraEnabled, screen: screenEnabled },
    {
      camera: Boolean(previewTracks.camera),
      screen: Boolean(previewTracks.screen),
    },
  );

  // Poll what is actually being sent so the host can tell a low setting
  // apart from a weak upload.
  const healthTrack = previewTracks.screen ?? previewTracks.camera;
  useEffect(() => {
    if (!connected || !healthTrack) {
      setHealth(undefined);
      return;
    }

    let active = true;
    let previous: PushSample | undefined;
    const tick = async () => {
      const stats = await healthTrack.getSenderStats().catch(() => []);
      const sample = samplePush(stats);

      if (!active || !sample) {
        return;
      }

      setHealth(pushHealth(previous, sample));
      previous = sample;
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [connected, healthTrack]);
  const healthWarning = health ? pushHealthWarning(health, quality) : undefined;

  const status = hostConnectionLabel(connection, previewReady);
  useEffect(() => onStatusChange?.(status), [onStatusChange, status]);

  // Tick the on-air timer once a second while connected.
  useEffect(() => {
    if (!connected) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [connected]);

  const checklist = studioChecklist({
    detailsReady,
    microphoneEnabled,
    previewReady,
  });
  const live = connected || room?.status === 'LIVE';
  // Leaving this page unmounts the studio and stops the stream, so ask first.
  useLeaveStudioGuard(connected);

  const stage = (
    <div className="min-w-0 space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-stage">
        {mainTrack ? (
          <LiveKitVideo
            className="h-full w-full object-contain"
            muted
            track={mainTrack}
          />
        ) : (
          <div className="grid h-full place-items-center px-8 text-center">
            <div>
              <p className="text-sm font-semibold text-white">
                Select a source to start the local preview
              </p>
              <p className="mt-2 max-w-sm text-xs leading-5 text-white/60">
                Nothing is sent to viewers until you confirm this preview and
                start the broadcast.
              </p>
              {screenEnabled ? (
                <button
                  className="mt-5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/85 disabled:opacity-50"
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

        {cameraOverlay && cameraUsesOverlay({ camera: true, screen: true }) ? (
          <div className="absolute bottom-4 right-4 aspect-video w-[26%] min-w-28 max-w-64 overflow-hidden rounded-lg border border-white/20 bg-black shadow-[var(--lp-shadow)]">
            <LiveKitVideo
              className="h-full w-full object-cover"
              muted
              track={cameraOverlay}
            />
          </div>
        ) : null}

        {connected ? (
          <span className="studio-stage-badge studio-stage-badge-live">
            <span aria-hidden="true" className="channel-dot" />
            LIVE · {formatBroadcastDuration(room?.startedAt, now)}
          </span>
        ) : previewReady ? (
          <span className="studio-stage-badge">Preview · not live</span>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SourceCard
          checked={screenEnabled}
          label="Share screen"
          onChange={(checked) =>
            void (checked ? chooseScreen() : disableScreen())
          }
        >
          <button
            className="studio-source-action"
            disabled={!screenEnabled || captureTarget !== undefined || pending}
            onClick={() => void chooseScreen()}
            type="button"
          >
            {previewTracks.screen ? 'Change shared screen' : 'Choose screen'}
          </button>
        </SourceCard>
        <SourceCard
          checked={cameraEnabled}
          label="Use camera"
          onChange={(checked) =>
            void (checked ? prepareCamera() : disableCamera())
          }
        >
          <DeviceSelect
            disabled={!cameraEnabled || captureTarget === 'camera'}
            fallback="Camera"
            label="Camera input"
            onChange={(id) => void selectDevice('videoinput', id)}
            options={videoDevices}
            value={videoDeviceId}
          />
        </SourceCard>
        <SourceCard
          checked={microphoneEnabled}
          label="Use microphone"
          onChange={(checked) => void toggleMicrophone(checked)}
        >
          <DeviceSelect
            disabled={!microphoneEnabled}
            fallback="Microphone"
            label="Microphone input"
            onChange={(id) => void selectDevice('audioinput', id)}
            options={audioDevices}
            value={audioDeviceId}
          />
        </SourceCard>
      </div>
      <div className="studio-source">
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingSelect
            disabled={applyingQuality || pending}
            label="Stream quality"
            onChange={(value) =>
              void changeStreamSettings(value as BroadcastQuality, content)
            }
            options={broadcastQualities.map((value) => ({
              label: broadcastQualityTiers[value].label,
              value,
            }))}
            value={quality}
          />
          <SettingSelect
            disabled={applyingQuality || pending}
            label="Content"
            onChange={(value) =>
              void changeStreamSettings(quality, value as BroadcastContent)
            }
            options={broadcastContents.map((value) => ({
              label: broadcastContentOptions[value].label,
              value,
            }))}
            value={content}
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">
          {applyingQuality
            ? 'Applying the new quality…'
            : `${broadcastQualityTiers[quality].hint}.${
                connected
                  ? ' Changing it while live pauses the video for about a second.'
                  : ''
              }`}
        </p>
        {connected && health ? (
          <p
            aria-live="polite"
            className={`mt-2 text-xs font-medium ${healthWarning ? 'text-danger' : 'text-fg-soft'}`}
            data-testid="push-health"
          >
            Sending {formatPushHealth(health)}
            {healthWarning ? ` · ${healthWarning}` : ''}
          </p>
        ) : null}
      </div>
      <button
        className="text-xs font-medium text-muted underline-offset-4 transition hover:text-fg hover:underline disabled:opacity-50"
        disabled={pending || captureTarget !== undefined}
        onClick={() => void loadDevices(true)}
        type="button"
      >
        Refresh input devices
      </button>
    </div>
  );

  if (chat) {
    // On-air layout: a compact bar for room details and broadcast controls,
    // then the preview with the live chat running down its right side.
    return (
      <div className="space-y-4">
        <div className="studio-onair-bar">
          <div className="min-w-0 flex-1">{details}</div>
          <div className="flex flex-wrap items-center gap-2">
            {connected ? null : (
              <>
                {!previewReady ? (
                  <span className="text-xs text-muted">
                    Prepare a screen or camera preview first.
                  </span>
                ) : null}
                <button
                  className="studio-bar-button studio-bar-button-primary"
                  disabled={
                    disabled ||
                    pending ||
                    reconnecting ||
                    captureTarget !== undefined ||
                    !previewReady
                  }
                  onClick={() => void startBroadcast()}
                  type="button"
                >
                  {pending
                    ? 'Starting…'
                    : reconnecting
                      ? 'Reconnecting…'
                      : 'Reconnect broadcast'}
                </button>
              </>
            )}
            {confirmingEnd ? (
              <div
                aria-label="Confirm ending the broadcast"
                className="flex flex-wrap items-center gap-2"
                role="group"
              >
                <span className="text-sm text-fg">End for everyone?</span>
                <button
                  className="studio-bar-button studio-bar-button-danger"
                  disabled={disabled || pending}
                  onClick={() => void endBroadcast()}
                  type="button"
                >
                  Confirm end
                </button>
                <button
                  className="studio-bar-button"
                  onClick={() => setConfirmingEnd(false)}
                  type="button"
                >
                  Keep live
                </button>
              </div>
            ) : (
              <button
                className="studio-bar-button studio-bar-button-end"
                disabled={disabled || pending}
                onClick={() => setConfirmingEnd(true)}
                type="button"
              >
                End broadcast
              </button>
            )}
          </div>
        </div>

        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {stage}
          <div className="studio-chat-slot">{chat}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
      {stage}

      <div className="space-y-5 rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-20">
        {details}

        {live ? null : (
          <ul aria-label="Before you go live" className="space-y-2">
            {checklist.map((item) => (
              <li
                className={`studio-check ${item.done ? 'studio-check-done' : ''} ${item.optional ? 'studio-check-optional' : ''}`}
                key={item.label}
              >
                <span aria-hidden="true" className="studio-check-mark" />
                {item.label}
                <span className="sr-only">
                  {item.done ? ' (done)' : item.optional ? '' : ' (to do)'}
                </span>
              </li>
            ))}
          </ul>
        )}

        {connected ? null : (
          <div className="space-y-2">
            <button
              className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-bold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              disabled={
                disabled ||
                pending ||
                reconnecting ||
                captureTarget !== undefined ||
                !previewReady ||
                (!room && !detailsReady) ||
                room?.status === 'ENDED'
              }
              onClick={() => void startBroadcast()}
              type="button"
            >
              {pending
                ? 'Starting…'
                : reconnecting
                  ? 'Reconnecting…'
                  : room?.status === 'LIVE'
                    ? 'Reconnect broadcast'
                    : 'Start live broadcast'}
            </button>
            {!previewReady ? (
              <p className="text-center text-xs leading-5 text-muted">
                Prepare a screen or camera preview first.
              </p>
            ) : null}
          </div>
        )}

        {live ? (
          confirmingEnd ? (
            <div
              aria-label="Confirm ending the broadcast"
              className="space-y-2 rounded-lg border border-danger/25 bg-danger/10 p-3"
              role="group"
            >
              <p className="text-sm text-fg">
                End the broadcast for everyone watching?
              </p>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-lg bg-danger px-3 py-2 text-sm font-bold text-white transition hover:bg-danger-hover disabled:cursor-wait disabled:opacity-50"
                  disabled={disabled || pending}
                  onClick={() => void endBroadcast()}
                  type="button"
                >
                  Confirm end
                </button>
                <button
                  className="flex-1 rounded-lg border border-line-strong px-3 py-2 text-sm font-semibold text-fg-soft transition hover:bg-raised"
                  onClick={() => setConfirmingEnd(false)}
                  type="button"
                >
                  Keep live
                </button>
              </div>
            </div>
          ) : (
            <button
              className="w-full rounded-lg border border-danger/40 px-4 py-3 text-sm font-bold text-danger transition hover:bg-danger/10 disabled:cursor-wait disabled:opacity-50"
              disabled={disabled || pending}
              onClick={() => setConfirmingEnd(true)}
              type="button"
            >
              End broadcast
            </button>
          )
        ) : null}

        {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
      </div>
    </div>
  );
}

function SourceCard({
  checked,
  children,
  label,
  onChange,
}: {
  checked: boolean;
  children: ReactNode;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <div className={`studio-source ${checked ? 'studio-source-on' : ''}`}>
      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-fg">
        {label}
        <input
          checked={checked}
          className="studio-switch"
          onChange={(event) => onChange(event.currentTarget.checked)}
          role="switch"
          type="checkbox"
        />
      </label>
      <div className="mt-3">{children}</div>
    </div>
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
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        className="w-full rounded-lg border border-line-strong bg-sunken px-3 py-2 text-sm text-fg outline-none transition focus:border-accent disabled:opacity-40"
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

function SettingSelect({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange(value: string): void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-fg-soft">{label}</span>
      <select
        className="mt-1 w-full rounded-lg border border-line-strong bg-sunken px-3 py-2 text-sm text-fg outline-none transition focus:border-accent disabled:opacity-40"
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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

  if (
    connection === ConnectionState.Reconnecting ||
    connection === ConnectionState.SignalReconnecting
  ) {
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
