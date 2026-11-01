'use client';

import { BroadcastConnectionResponseSchema } from '@livepulse/contracts';
import {
  ConnectionState,
  type RemoteAudioTrack,
  type RemoteTrackPublication,
  type RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
} from 'livekit-client';
import { useEffect, useRef, useState } from 'react';

import {
  type PublishedLayer,
  type ViewerQualityOption,
  type ViewerQualityPreference,
  requestedVideoQuality,
  viewerQualityOptions,
} from '../lib/broadcast-quality';
import { clientApiRequest } from '../lib/client-api';
import { LiveKitAudio, LiveKitVideo } from './livekit-media';

interface ViewerTracks {
  audio: RemoteAudioTrack[];
  camera?: RemoteVideoTrack;
  cameraPublication?: RemoteTrackPublication;
  screen?: RemoteVideoTrack;
  screenPublication?: RemoteTrackPublication;
}

const emptyTracks: ViewerTracks = { audio: [] };

export function LiveBroadcastPlayer({
  coverImageUrl,
  onQualityOptions,
  paused = false,
  quality = 'auto',
  reloadKey = 0,
  roomId,
  volume = 1,
}: {
  coverImageUrl: string | null;
  /** Reports the layers the host is sending and the one being received. */
  onQualityOptions?(options: ViewerQualityOption[]): void;
  paused?: boolean;
  quality?: ViewerQualityPreference;
  // Changing this reconnects to the broadcast, which jumps back to live.
  reloadKey?: number;
  roomId: string;
  volume?: number;
}) {
  const liveKitRoom = useRef<Room | undefined>(undefined);
  const [connection, setConnection] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [error, setError] = useState<string>();
  const [tracks, setTracks] = useState<ViewerTracks>(emptyTracks);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    // Adaptive stream would cap every layer at the player's on-screen size and
    // override the viewer's quality choice. Without it the server still steps
    // down when the viewer's connection cannot keep up.
    const room = new Room({ adaptiveStream: false, dynacast: true });
    let active = true;
    liveKitRoom.current = room;

    const refreshTracks = () => {
      if (active) {
        setTracks(collectViewerTracks(room));
      }
    };
    const refreshAudioState = () => {
      if (active) {
        setAudioBlocked(!room.canPlaybackAudio);
      }
    };
    const refreshConnection = (state: ConnectionState) => {
      if (active) {
        setConnection(state);
      }
    };

    room
      .on(RoomEvent.TrackSubscribed, refreshTracks)
      .on(RoomEvent.TrackUnsubscribed, refreshTracks)
      .on(RoomEvent.TrackMuted, refreshTracks)
      .on(RoomEvent.TrackUnmuted, refreshTracks)
      .on(RoomEvent.ParticipantDisconnected, refreshTracks)
      .on(RoomEvent.ConnectionStateChanged, refreshConnection)
      .on(RoomEvent.AudioPlaybackStatusChanged, refreshAudioState);

    void (async () => {
      try {
        const credentials = await clientApiRequest(
          `/api/v1/rooms/${roomId}/broadcast/viewer-token`,
          BroadcastConnectionResponseSchema,
          { method: 'POST' },
        );

        if (!active) {
          return;
        }

        await room.connect(
          credentials.serverUrl,
          credentials.participantToken,
          { autoSubscribe: true },
        );
        refreshTracks();
        refreshAudioState();
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'The live video could not be loaded.',
          );
        }
      }
    })();

    return () => {
      active = false;
      liveKitRoom.current = undefined;
      void room.disconnect();
    };
  }, [roomId, reloadKey]);

  const mainTrack = tracks.screen ?? tracks.camera;
  const cameraOverlay = tracks.screen ? tracks.camera : undefined;
  const mainPublication = tracks.screen
    ? tracks.screenPublication
    : tracks.cameraPublication;
  const overlayPublication = tracks.screen
    ? tracks.cameraPublication
    : undefined;

  // Ask the server for the chosen layer; the small camera window only ever
  // needs the lowest one.
  useEffect(() => {
    mainPublication?.setVideoQuality(
      requestedVideoQuality(quality, publishedLayers(mainPublication)),
    );
    overlayPublication?.setVideoQuality(VideoQuality.LOW);
  }, [mainPublication, overlayPublication, quality]);

  // Tell the controls which layers exist and what is being received now.
  const reportOptions = useRef(onQualityOptions);
  reportOptions.current = onQualityOptions;
  useEffect(() => {
    let active = true;
    let last = '';
    const report = async () => {
      const stats = await mainTrack?.getReceiverStats().catch(() => undefined);
      const current =
        stats?.frameWidth && stats.frameHeight
          ? { width: stats.frameWidth, height: stats.frameHeight }
          : undefined;
      const options = viewerQualityOptions(
        publishedLayers(mainPublication),
        current,
      );
      const key = JSON.stringify(options);

      if (active && key !== last) {
        last = key;
        reportOptions.current?.(options);
      }
    };

    void report();
    const timer = mainTrack
      ? window.setInterval(() => void report(), 3_000)
      : undefined;
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [mainPublication, mainTrack]);

  async function enableAudio() {
    const room = liveKitRoom.current;

    if (!room) {
      return;
    }

    await room.startAudio();
    setAudioBlocked(!room.canPlaybackAudio);
  }

  return (
    <div className="relative aspect-video min-h-64 overflow-hidden bg-stage">
      {mainTrack ? (
        <>
          {/* A blurred, cropped copy fills the letterbox around streams that are
              not 16:9 (vertical phones, 4:3 cameras) so the frame never shows
              hard black bars. The sharp copy is never cropped. */}
          <LiveKitVideo
            className="stage-fill"
            muted
            paused={paused}
            track={mainTrack}
          />
          <LiveKitVideo
            className="relative z-[1] h-full w-full object-contain"
            paused={paused}
            track={mainTrack}
          />
        </>
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={
            coverImageUrl
              ? { backgroundImage: `url(${JSON.stringify(coverImageUrl)})` }
              : undefined
          }
        >
          <div className="grid h-full place-items-center bg-black/70 px-6 text-center">
            <div>
              <span className="mx-auto block h-3 w-3 animate-pulse rounded-full bg-danger" />
              <p className="mt-4 text-sm font-semibold text-white">
                Waiting for the host video…
              </p>
              <p className="mt-2 text-xs text-white/60">
                {error ?? connectionLabel(connection)}
              </p>
            </div>
          </div>
        </div>
      )}

      {cameraOverlay ? (
        <div className="absolute right-4 top-4 z-10 aspect-video w-[28%] min-w-28 max-w-72 overflow-hidden rounded-lg border border-white/20 bg-black shadow-2xl shadow-black/60">
          <LiveKitVideo
            className="h-full w-full object-cover"
            paused={paused}
            track={cameraOverlay}
          />
        </div>
      ) : null}

      {tracks.audio.map((track) => (
        <LiveKitAudio key={track.sid} track={track} volume={volume} />
      ))}

      <span className="stage-overlay stage-status">
        {connectionLabel(connection)}
      </span>

      {audioBlocked ? (
        <button
          className="stage-enable-sound"
          onClick={() => void enableAudio()}
          type="button"
        >
          Enable sound
        </button>
      ) : null}
    </div>
  );
}

function collectViewerTracks(room: Room): ViewerTracks {
  const result: ViewerTracks = { audio: [] };

  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      const track = publication.track;

      if (!track || publication.isMuted) {
        continue;
      }

      if (track.kind === Track.Kind.Audio) {
        result.audio.push(track as RemoteAudioTrack);
      } else if (publication.source === Track.Source.ScreenShare) {
        result.screen = track as RemoteVideoTrack;
        result.screenPublication = publication;
      } else if (publication.source === Track.Source.Camera) {
        result.camera = track as RemoteVideoTrack;
        result.cameraPublication = publication;
      }
    }
  }

  return result;
}

function publishedLayers(
  publication: RemoteTrackPublication | undefined,
): PublishedLayer[] {
  // livekit-client's VideoQuality shares its values with the protocol enum,
  // which also has OFF; drop anything that is not a real layer.
  return (publication?.trackInfo?.layers ?? [])
    .filter((layer) => (layer.quality as number) <= VideoQuality.HIGH)
    .map((layer) => ({
      height: layer.height,
      quality: layer.quality as number as VideoQuality,
      width: layer.width,
    }));
}

function connectionLabel(connection: ConnectionState): string {
  if (connection === ConnectionState.Connected) {
    return 'Live';
  }

  if (connection === ConnectionState.Reconnecting) {
    return 'Reconnecting…';
  }

  if (connection === ConnectionState.Connecting) {
    return 'Connecting…';
  }

  return 'Offline';
}
