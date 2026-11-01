import { Track, VideoQuality } from 'livekit-client';
import { describe, expect, it } from 'vitest';

import {
  captureConstraints,
  captureResolution,
  formatBitrate,
  formatPushHealth,
  parseBroadcastContent,
  parseBroadcastQuality,
  parseViewerQuality,
  publishOptionsFor,
  pushHealth,
  pushHealthWarning,
  requestedVideoQuality,
  samplePush,
  viewerQualityOptions,
} from './broadcast-quality';

const layers = [
  { quality: VideoQuality.LOW, width: 640, height: 360 },
  { quality: VideoQuality.HIGH, width: 1920, height: 1080 },
  { quality: VideoQuality.MEDIUM, width: 1280, height: 720 },
];

describe('broadcast quality tiers', () => {
  it('falls back to HD and motion for unknown stored values', () => {
    expect(parseBroadcastQuality(null)).toBe('hd');
    expect(parseBroadcastQuality('8k')).toBe('hd');
    expect(parseBroadcastQuality('ultra')).toBe('ultra');
    expect(parseBroadcastContent('nonsense')).toBe('motion');
    expect(parseBroadcastContent('detail')).toBe('detail');
  });

  it('captures at the tier size and frame rate', () => {
    expect(captureResolution('hd')).toMatchObject({
      width: 1920,
      height: 1080,
      frameRate: 30,
    });
    expect(captureResolution('ultra').frameRate).toBe(60);
    expect(captureConstraints('smooth')).toEqual({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: 30,
    });
  });

  it('publishes screen shares with the tier encoding, layers and content preference', () => {
    const options = publishOptionsFor(Track.Source.ScreenShare, 'hd', 'detail');

    expect(options.source).toBe(Track.Source.ScreenShare);
    expect(options.simulcast).toBe(true);
    expect(options.screenShareEncoding).toMatchObject({
      maxBitrate: 5_000_000,
      maxFramerate: 30,
    });
    expect(options.screenShareSimulcastLayers?.map((l) => l.height)).toEqual([
      360, 720,
    ]);
    expect(options.degradationPreference).toBe('maintain-resolution');
    expect(
      publishOptionsFor(Track.Source.ScreenShare, 'hd', 'motion')
        .degradationPreference,
    ).toBe('maintain-framerate');
  });

  it('publishes cameras with the tier encoding and leaves audio alone', () => {
    const camera = publishOptionsFor(Track.Source.Camera, 'smooth', 'motion');
    expect(camera.videoEncoding).toMatchObject({ maxBitrate: 2_000_000 });
    expect(camera.videoSimulcastLayers?.map((l) => l.height)).toEqual([360]);

    expect(
      publishOptionsFor(Track.Source.ScreenShareAudio, 'ultra', 'motion'),
    ).toEqual({ source: Track.Source.ScreenShareAudio });
  });
});

describe('push health', () => {
  it('reports the top layer and the bitrate across all layers', () => {
    const first = samplePush([
      {
        bytesSent: 1_000,
        frameWidth: 640,
        frameHeight: 360,
        framesPerSecond: 30,
        timestamp: 1_000,
      },
      {
        bytesSent: 4_000,
        frameWidth: 1920,
        frameHeight: 1080,
        framesPerSecond: 29.6,
        timestamp: 1_000,
      },
    ]);
    const second = samplePush([
      {
        bytesSent: 101_000,
        frameWidth: 640,
        frameHeight: 360,
        framesPerSecond: 30,
        timestamp: 3_000,
      },
      {
        bytesSent: 1_154_000,
        frameWidth: 1920,
        frameHeight: 1080,
        framesPerSecond: 30,
        timestamp: 3_000,
      },
    ]);

    expect(first).toMatchObject({ width: 1920, height: 1080, fps: 30 });
    const health = pushHealth(first, second!);
    // 1,250,000 bytes in 2 s = 5,000 kbps
    expect(health.bitrateKbps).toBe(5_000);
    expect(formatPushHealth(health)).toBe('1920×1080 · 30 fps · 5.0 Mbps');
    expect(pushHealth(undefined, second!).bitrateKbps).toBe(0);
  });

  it('flags bandwidth or CPU limits and suggests a lower tier', () => {
    const sample = samplePush([
      {
        bytesSent: 0,
        frameWidth: 960,
        frameHeight: 540,
        timestamp: 1,
        qualityLimitationReason: 'bandwidth',
      },
    ])!;
    const health = pushHealth(undefined, sample);

    expect(health.limitation).toBe('bandwidth');
    expect(pushHealthWarning(health, 'hd')).toContain('Try a lower quality');
    expect(pushHealthWarning(health, 'smooth')).not.toContain('Try');
    expect(
      pushHealthWarning({ ...health, limitation: undefined }, 'hd'),
    ).toBeUndefined();
    expect(samplePush([])).toBeUndefined();
    expect(formatBitrate(850)).toBe('850 kbps');
  });
});

describe('viewer quality', () => {
  it('lists Auto plus each published layer, tallest first', () => {
    expect(viewerQualityOptions(layers, { width: 1280, height: 720 })).toEqual([
      { label: 'Auto (720p)', value: 'auto' },
      { label: '1080p', value: 1080 },
      { label: '720p', value: 720 },
      { label: '360p', value: 360 },
    ]);
    expect(viewerQualityOptions([])).toEqual([
      { label: 'Auto', value: 'auto' },
    ]);
  });

  it('names portrait layers by their short side', () => {
    expect(
      viewerQualityOptions([
        { quality: VideoQuality.HIGH, width: 1080, height: 1920 },
      ])[1],
    ).toEqual({ label: '1080p', value: 1080 });
  });

  it('caps at the tallest layer not above the choice', () => {
    expect(requestedVideoQuality('auto', layers)).toBe(VideoQuality.HIGH);
    expect(requestedVideoQuality(1080, layers)).toBe(VideoQuality.HIGH);
    expect(requestedVideoQuality(720, layers)).toBe(VideoQuality.MEDIUM);
    expect(requestedVideoQuality(480, layers)).toBe(VideoQuality.LOW);
    // Below every layer: the lowest one.
    expect(requestedVideoQuality(144, layers)).toBe(VideoQuality.LOW);
    expect(requestedVideoQuality(720, [])).toBe(VideoQuality.HIGH);
  });

  it('reads stored choices safely', () => {
    expect(parseViewerQuality(null)).toBe('auto');
    expect(parseViewerQuality('auto')).toBe('auto');
    expect(parseViewerQuality('720')).toBe(720);
    expect(parseViewerQuality('-3')).toBe('auto');
  });
});
