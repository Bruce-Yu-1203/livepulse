'use client';

import type {
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
} from 'livekit-client';
import { useEffect, useRef } from 'react';

export function LiveKitVideo({
  className,
  muted = false,
  paused = false,
  track,
}: {
  className?: string;
  muted?: boolean;
  paused?: boolean;
  track: LocalVideoTrack | RemoteVideoTrack;
}) {
  const element = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = element.current;

    if (!video) {
      return;
    }

    track.attach(video);

    return () => {
      track.detach(video);
    };
  }, [track]);

  // Pausing freezes the current frame; resuming plays the live edge again.
  useEffect(() => {
    const video = element.current;

    if (!video) {
      return;
    }

    if (paused) {
      video.pause();
    } else {
      void video.play().catch(() => undefined);
    }
  }, [paused, track]);

  return (
    <video
      autoPlay
      className={className}
      data-livekit-track={track.source}
      muted={muted}
      playsInline
      ref={element}
    />
  );
}

export function LiveKitAudio({
  track,
  volume = 1,
}: {
  track: RemoteAudioTrack;
  volume?: number;
}) {
  const element = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = element.current;

    if (!audio) {
      return;
    }

    track.attach(audio);

    return () => {
      track.detach(audio);
    };
  }, [track]);

  useEffect(() => {
    if (element.current) {
      element.current.volume = volume;
    }
  }, [track, volume]);

  return <audio autoPlay data-livekit-track={track.source} ref={element} />;
}
