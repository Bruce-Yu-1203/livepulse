import { Track } from 'livekit-client';
import { describe, expect, it } from 'vitest';

import {
  cameraUsesOverlay,
  hasBroadcastVideo,
  mediaDeviceLabel,
  primaryVideoSource,
} from './livekit-broadcast';

describe('broadcast video layout', () => {
  it('requires at least one video source', () => {
    expect(hasBroadcastVideo({ camera: false, screen: false })).toBe(false);
    expect(hasBroadcastVideo({ camera: true, screen: false })).toBe(true);
    expect(hasBroadcastVideo({ camera: false, screen: true })).toBe(true);
  });

  it('uses screen share as the main track and camera as the overlay', () => {
    const selection = { camera: true, screen: true };

    expect(primaryVideoSource(selection)).toBe(Track.Source.ScreenShare);
    expect(cameraUsesOverlay(selection)).toBe(true);
  });

  it('uses the camera as the main track when it is the only source', () => {
    const selection = { camera: true, screen: false };

    expect(primaryVideoSource(selection)).toBe(Track.Source.Camera);
    expect(cameraUsesOverlay(selection)).toBe(false);
  });

  it('provides a stable label before device permission reveals names', () => {
    expect(
      mediaDeviceLabel({ deviceId: 'camera-1', label: '' }, 1, 'Camera'),
    ).toBe('Camera 2');
  });
});
