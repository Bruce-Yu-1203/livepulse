import type { ReactNode } from 'react';

import type {
  ViewerQualityOption,
  ViewerQualityPreference,
} from '../lib/broadcast-quality';
import { danmakuDensities, type DanmakuDensity } from '../lib/danmaku';
import { volumeLevel } from '../lib/player-controls';

const icons = {
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4.5v15l12-7.5-12-7.5Z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  'volume-high':
    'M4 9.5h3.5L12 5v14l-4.5-4.5H4v-5ZM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  'volume-low': 'M4 9.5h3.5L12 5v14l-4.5-4.5H4v-5ZM15.5 9a4 4 0 0 1 0 6',
  'volume-muted': 'M4 9.5h3.5L12 5v14l-4.5-4.5H4v-5ZM16 9.5l5 5m0-5-5 5',
  'danmaku-on': 'M4 5h16v11H9l-4 3.5V5ZM8 9h8M8 12.5h5',
  'danmaku-off': 'M4 5h16v11H9l-4 3.5V5ZM4 4l16 16',
  'fullscreen-enter': 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  'fullscreen-exit': 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
} as const;

export function StageIcon({ name }: { name: keyof typeof icons }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d={icons[name]}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function StageButton({
  children,
  label,
  onClick,
  pressed,
}: {
  children: ReactNode;
  label: string;
  onClick(): void;
  pressed?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="stage-button"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function PlaybackControls({
  muted,
  onRefresh,
  onToggleMute,
  onTogglePause,
  onVolume,
  paused,
  volume,
}: {
  muted: boolean;
  onRefresh(): void;
  onToggleMute(): void;
  onTogglePause(): void;
  onVolume(volume: number): void;
  paused: boolean;
  volume: number;
}) {
  const level = volumeLevel(volume, muted);

  return (
    <div className="stage-control-group">
      <StageButton label={paused ? 'Play' : 'Pause'} onClick={onTogglePause}>
        <StageIcon name={paused ? 'play' : 'pause'} />
      </StageButton>
      <StageButton label="Refresh and catch up to live" onClick={onRefresh}>
        <StageIcon name="refresh" />
      </StageButton>
      <div className="stage-volume">
        <StageButton label={muted ? 'Unmute' : 'Mute'} onClick={onToggleMute}>
          <StageIcon name={`volume-${level}`} />
        </StageButton>
        <input
          aria-label="Volume"
          max={1}
          min={0}
          onChange={(event) => onVolume(Number(event.currentTarget.value))}
          step={0.05}
          type="range"
          value={muted ? 0 : volume}
        />
      </div>
    </div>
  );
}

export function ViewingControls({
  danmakuDensity,
  danmakuVisible,
  fullscreen,
  onDanmakuDensity,
  onQuality,
  onToggleDanmaku,
  onToggleFullscreen,
  quality = 'auto',
  qualityOptions = [],
}: {
  danmakuDensity: DanmakuDensity;
  danmakuVisible: boolean;
  fullscreen: boolean;
  onDanmakuDensity(density: DanmakuDensity): void;
  onQuality?(quality: ViewerQualityPreference): void;
  onToggleDanmaku(): void;
  onToggleFullscreen(): void;
  quality?: ViewerQualityPreference;
  qualityOptions?: ViewerQualityOption[];
}) {
  // A saved choice the current host does not send still shows as selected.
  const options =
    quality !== 'auto' &&
    !qualityOptions.some((option) => option.value === quality)
      ? [...qualityOptions, { label: `${quality}p`, value: quality }]
      : qualityOptions;

  return (
    <div className="stage-control-group">
      {onQuality && options.length > 0 ? (
        <select
          aria-label="Video quality"
          className="stage-select"
          onChange={(event) => {
            const value = event.currentTarget.value;
            onQuality(value === 'auto' ? 'auto' : Number(value));
          }}
          title="Video quality"
          value={String(quality)}
        >
          {options.map((option) => (
            <option key={option.value} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      <StageButton
        label={danmakuVisible ? 'Hide danmaku' : 'Show danmaku'}
        onClick={onToggleDanmaku}
        pressed={danmakuVisible}
      >
        <StageIcon name={danmakuVisible ? 'danmaku-on' : 'danmaku-off'} />
      </StageButton>
      <select
        aria-label="Danmaku density"
        className="stage-select"
        disabled={!danmakuVisible}
        onChange={(event) =>
          onDanmakuDensity(event.currentTarget.value as DanmakuDensity)
        }
        value={danmakuDensity}
      >
        {danmakuDensities.map((density) => (
          <option key={density} value={density}>
            {density[0]?.toUpperCase() + density.slice(1)} density
          </option>
        ))}
      </select>
      <StageButton
        label={fullscreen ? 'Exit full screen' : 'Full screen'}
        onClick={onToggleFullscreen}
      >
        <StageIcon name={fullscreen ? 'fullscreen-exit' : 'fullscreen-enter'} />
      </StageButton>
    </div>
  );
}
