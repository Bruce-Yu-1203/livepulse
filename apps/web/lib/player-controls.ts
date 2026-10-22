export type VolumeLevel = 'muted' | 'low' | 'high';

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}

// The volume actually applied to audio elements.
export function effectiveVolume(
  volume: number,
  muted: boolean,
  paused: boolean,
): number {
  return muted || paused ? 0 : clampVolume(volume);
}

export function volumeLevel(volume: number, muted: boolean): VolumeLevel {
  const value = clampVolume(volume);
  if (muted || value === 0) {
    return 'muted';
  }
  return value < 0.5 ? 'low' : 'high';
}

export const CHAT_COLLAPSED_KEY = 'livepulse-chat-collapsed';
