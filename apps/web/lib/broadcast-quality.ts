import {
  type TrackPublishOptions,
  Track,
  VideoPreset,
  VideoQuality,
} from 'livekit-client';

/*
 * Host side: a few named quality tiers instead of raw bitrate inputs. Each tier
 * fixes the capture size, frame rate, top bitrate and the extra simulcast
 * layers viewers can switch between.
 */

export type BroadcastQuality = 'smooth' | 'hd' | 'ultra';
export type BroadcastContent = 'motion' | 'detail';

export const BROADCAST_QUALITY_KEY = 'livepulse-broadcast-quality';
export const BROADCAST_CONTENT_KEY = 'livepulse-broadcast-content';
export const DEFAULT_BROADCAST_QUALITY: BroadcastQuality = 'hd';
export const DEFAULT_BROADCAST_CONTENT: BroadcastContent = 'motion';

interface QualityTier {
  label: string;
  hint: string;
  top: VideoPreset;
  /** Lower layers, lowest first; at most two (LiveKit sends three in total). */
  layers: VideoPreset[];
}

const layer360 = new VideoPreset(640, 360, 450_000, 30);
const layer720 = new VideoPreset(1280, 720, 1_700_000, 30);

export const broadcastQualityTiers: Record<BroadcastQuality, QualityTier> = {
  smooth: {
    label: 'Smooth · 720p',
    hint: '2 Mbps, needs about 3 Mbps upload',
    top: new VideoPreset(1280, 720, 2_000_000, 30),
    layers: [layer360],
  },
  hd: {
    label: 'HD · 1080p',
    hint: '5 Mbps, needs about 7 Mbps upload',
    top: new VideoPreset(1920, 1080, 5_000_000, 30),
    layers: [layer360, layer720],
  },
  ultra: {
    label: 'Ultra · 1080p60',
    hint: '8 Mbps, needs about 12 Mbps upload',
    top: new VideoPreset(1920, 1080, 8_000_000, 60),
    layers: [layer360, layer720],
  },
};

export const broadcastQualities = Object.keys(
  broadcastQualityTiers,
) as BroadcastQuality[];

export const broadcastContentOptions: Record<
  BroadcastContent,
  {
    label: string;
    contentHint: 'motion' | 'detail';
    degradation: RTCDegradationPreference;
  }
> = {
  // Under pressure keep the motion smooth and drop resolution first.
  motion: {
    label: 'Games & video',
    contentHint: 'motion',
    degradation: 'maintain-framerate',
  },
  // Under pressure keep text sharp and drop frame rate first.
  detail: {
    label: 'Text & slides',
    contentHint: 'detail',
    degradation: 'maintain-resolution',
  },
};

export const broadcastContents = Object.keys(
  broadcastContentOptions,
) as BroadcastContent[];

export function parseBroadcastQuality(raw: string | null): BroadcastQuality {
  return raw && raw in broadcastQualityTiers
    ? (raw as BroadcastQuality)
    : DEFAULT_BROADCAST_QUALITY;
}

export function parseBroadcastContent(raw: string | null): BroadcastContent {
  return raw && raw in broadcastContentOptions
    ? (raw as BroadcastContent)
    : DEFAULT_BROADCAST_CONTENT;
}

/** Capture resolution for createLocalVideoTrack / createLocalScreenTracks. */
export function captureResolution(quality: BroadcastQuality) {
  return broadcastQualityTiers[quality].top.resolution;
}

/** Constraints that resize an already running capture to a new tier. */
export function captureConstraints(
  quality: BroadcastQuality,
): MediaTrackConstraints {
  const { width, height, frameRate } = captureResolution(quality);
  return { width: { ideal: width }, height: { ideal: height }, frameRate };
}

export function publishOptionsFor(
  source: Track.Source,
  quality: BroadcastQuality,
  content: BroadcastContent,
): TrackPublishOptions {
  const tier = broadcastQualityTiers[quality];

  if (source === Track.Source.ScreenShare) {
    return {
      degradationPreference: broadcastContentOptions[content].degradation,
      screenShareEncoding: tier.top.encoding,
      screenShareSimulcastLayers: tier.layers,
      simulcast: true,
      source,
    };
  }

  if (source === Track.Source.Camera) {
    return {
      simulcast: true,
      source,
      videoEncoding: tier.top.encoding,
      videoSimulcastLayers: tier.layers,
    };
  }

  return { source };
}

/*
 * Push health: what the host is actually sending, read from the WebRTC sender
 * stats every few seconds.
 */

export interface SenderLayerStats {
  bytesSent?: number;
  frameHeight?: number;
  frameWidth?: number;
  framesPerSecond?: number;
  qualityLimitationReason?: string;
  timestamp: number;
}

export interface PushSample {
  bytesSent: number;
  fps: number;
  height: number;
  limitation?: 'bandwidth' | 'cpu';
  timestamp: number;
  width: number;
}

export interface PushHealth {
  bitrateKbps: number;
  fps: number;
  height: number;
  limitation?: 'bandwidth' | 'cpu';
  width: number;
}

export function samplePush(layers: SenderLayerStats[]): PushSample | undefined {
  if (layers.length === 0) {
    return undefined;
  }

  const top = layers.reduce((best, layer) =>
    (layer.frameWidth ?? 0) > (best.frameWidth ?? 0) ? layer : best,
  );
  const limited = layers
    .map((layer) => layer.qualityLimitationReason)
    .find((reason) => reason === 'bandwidth' || reason === 'cpu');

  return {
    bytesSent: layers.reduce((sum, layer) => sum + (layer.bytesSent ?? 0), 0),
    fps: Math.round(top.framesPerSecond ?? 0),
    height: top.frameHeight ?? 0,
    limitation: limited,
    timestamp: Math.max(...layers.map((layer) => layer.timestamp)),
    width: top.frameWidth ?? 0,
  };
}

export function pushHealth(
  previous: PushSample | undefined,
  next: PushSample,
): PushHealth {
  const elapsedMs = previous ? next.timestamp - previous.timestamp : 0;
  const bytes = previous ? next.bytesSent - previous.bytesSent : 0;
  const bitrateKbps =
    elapsedMs > 0 && bytes >= 0 ? Math.round((bytes * 8) / elapsedMs) : 0;

  return {
    bitrateKbps,
    fps: next.fps,
    height: next.height,
    limitation: next.limitation,
    width: next.width,
  };
}

export function formatBitrate(kbps: number): string {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`;
}

export function formatPushHealth(health: PushHealth): string {
  const size =
    health.width > 0 ? `${health.width}×${health.height}` : 'Waiting for video';
  return `${size} · ${health.fps} fps · ${formatBitrate(health.bitrateKbps)}`;
}

export function pushHealthWarning(
  health: PushHealth,
  quality: BroadcastQuality,
): string | undefined {
  if (health.limitation === 'bandwidth') {
    return quality === 'smooth'
      ? 'Upload bandwidth is limiting the stream.'
      : 'Upload bandwidth is limiting the stream. Try a lower quality.';
  }

  if (health.limitation === 'cpu') {
    return quality === 'smooth'
      ? 'Your computer is struggling to encode the stream.'
      : 'Your computer is struggling to encode the stream. Try a lower quality.';
  }

  return undefined;
}

/*
 * Viewer side: pick a maximum layer from the ones the host is sending.
 */

export type ViewerQualityPreference = 'auto' | number;

export const VIEWER_QUALITY_KEY = 'livepulse-viewer-quality';

export interface PublishedLayer {
  height: number;
  quality: VideoQuality;
  width: number;
}

export interface ViewerQualityOption {
  label: string;
  value: ViewerQualityPreference;
}

export function parseViewerQuality(
  raw: string | null,
): ViewerQualityPreference {
  const value = Number(raw);
  return raw && Number.isInteger(value) && value > 0 ? value : 'auto';
}

/** Distinct layers, tallest first; the short side names the layer (1080p). */
export function sortLayers(layers: PublishedLayer[]): PublishedLayer[] {
  const seen = new Set<number>();
  return [...layers]
    .filter((layer) => layer.width > 0 && layer.height > 0)
    .sort((a, b) => layerLines(b) - layerLines(a))
    .filter((layer) => {
      const lines = layerLines(layer);
      if (seen.has(lines)) {
        return false;
      }
      seen.add(lines);
      return true;
    });
}

export function layerLines(layer: { height: number; width: number }): number {
  return Math.min(layer.width, layer.height);
}

export function viewerQualityOptions(
  layers: PublishedLayer[],
  current?: { height: number; width: number },
): ViewerQualityOption[] {
  const currentLines = current ? layerLines(current) : 0;
  return [
    {
      label: currentLines > 0 ? `Auto (${currentLines}p)` : 'Auto',
      value: 'auto',
    },
    ...sortLayers(layers).map((layer) => ({
      label: `${layerLines(layer)}p`,
      value: layerLines(layer),
    })),
  ];
}

/**
 * The layer quality to request. Auto asks for the top layer and lets the
 * server step down when the viewer's connection cannot keep up; a fixed choice
 * caps it at the tallest layer not above the chosen one.
 */
export function requestedVideoQuality(
  preference: ViewerQualityPreference,
  layers: PublishedLayer[],
): VideoQuality {
  if (preference === 'auto') {
    return VideoQuality.HIGH;
  }

  const sorted = sortLayers(layers);
  const match =
    sorted.find((layer) => layerLines(layer) <= preference) ?? sorted.at(-1);
  return match?.quality ?? VideoQuality.HIGH;
}
