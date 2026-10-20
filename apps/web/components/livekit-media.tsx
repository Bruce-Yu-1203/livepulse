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
  track,
}: {
  className?: string;
  muted?: boolean;
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

export function LiveKitAudio({ track }: { track: RemoteAudioTrack }) {
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

  return <audio autoPlay data-livekit-track={track.source} ref={element} />;
}
