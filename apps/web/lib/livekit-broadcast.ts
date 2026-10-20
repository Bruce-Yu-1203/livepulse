import { Track } from 'livekit-client';

export interface BroadcastVideoSelection {
  camera: boolean;
  screen: boolean;
}

export function hasBroadcastVideo(selection: BroadcastVideoSelection): boolean {
  return selection.camera || selection.screen;
}

export function broadcastPreviewReady(
  selection: BroadcastVideoSelection,
  preview: BroadcastVideoSelection,
): boolean {
  return (
    hasBroadcastVideo(selection) &&
    (!selection.screen || preview.screen) &&
    (!selection.camera || preview.camera)
  );
}

export function primaryVideoSource(
  selection: BroadcastVideoSelection,
): Track.Source.Camera | Track.Source.ScreenShare | undefined {
  if (selection.screen) {
    return Track.Source.ScreenShare;
  }

  if (selection.camera) {
    return Track.Source.Camera;
  }

  return undefined;
}

export function cameraUsesOverlay(selection: BroadcastVideoSelection): boolean {
  return selection.screen && selection.camera;
}

export function mediaDeviceLabel(
  device: Pick<MediaDeviceInfo, 'deviceId' | 'label'>,
  index: number,
  fallback: 'Camera' | 'Microphone',
): string {
  return device.label.trim() || `${fallback} ${index + 1}`;
}
