'use client';

import { BroadcastConnectionResponseSchema } from '@livepulse/contracts';
import {
  ConnectionState,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { useEffect, useRef, useState } from 'react';

import { clientApiRequest } from '../lib/client-api';
import { LiveKitAudio, LiveKitVideo } from './livekit-media';

interface ViewerTracks {
  audio: RemoteAudioTrack[];
  camera?: RemoteVideoTrack;
  screen?: RemoteVideoTrack;
}

const emptyTracks: ViewerTracks = { audio: [] };

export function LiveBroadcastPlayer({
  coverImageUrl,
  roomId,
}: {
  coverImageUrl: string | null;
  roomId: string;
}) {
  const liveKitRoom = useRef<Room | undefined>(undefined);
  const [connection, setConnection] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [error, setError] = useState<string>();
  const [tracks, setTracks] = useState<ViewerTracks>(emptyTracks);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
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
  }, [roomId]);

  const mainTrack = tracks.screen ?? tracks.camera;
  const cameraOverlay = tracks.screen ? tracks.camera : undefined;

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
        <LiveKitVideo
          className="h-full w-full object-contain"
          track={mainTrack}
        />
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
        <div className="absolute right-4 top-4 z-10 aspect-video w-[28%] min-w-28 max-w-72 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl shadow-black/60">
          <LiveKitVideo
            className="h-full w-full object-cover"
            track={cameraOverlay}
          />
        </div>
      ) : null}

      {tracks.audio.map((track) => (
        <LiveKitAudio key={track.sid} track={track} />
      ))}

      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
        {audioBlocked ? (
          <button
            className="rounded-full bg-white px-3 py-2 text-xs font-bold text-black"
            onClick={() => void enableAudio()}
            type="button"
          >
            Enable sound
          </button>
        ) : null}
        <span className="rounded-full border border-white/15 bg-black/65 px-3 py-2 text-xs font-semibold text-white backdrop-blur">
          {connectionLabel(connection)}
        </span>
      </div>
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
      } else if (publication.source === Track.Source.Camera) {
        result.camera = track as RemoteVideoTrack;
      }
    }
  }

  return result;
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
