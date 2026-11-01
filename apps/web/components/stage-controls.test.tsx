import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PlaybackControls, ViewingControls } from './stage-controls';

const noop = () => undefined;

describe('PlaybackControls', () => {
  it('offers pause, live refresh and volume', () => {
    const html = renderToStaticMarkup(
      <PlaybackControls
        muted={false}
        onRefresh={noop}
        onToggleMute={noop}
        onTogglePause={noop}
        onVolume={noop}
        paused={false}
        volume={0.8}
      />,
    );

    expect(html).toContain('aria-label="Pause"');
    expect(html).toContain('aria-label="Refresh and catch up to live"');
    expect(html).toContain('aria-label="Mute"');
    expect(html).toContain('aria-label="Volume"');
    expect(html).toContain('value="0.8"');
  });

  it('switches to play and unmute labels', () => {
    const html = renderToStaticMarkup(
      <PlaybackControls
        muted
        onRefresh={noop}
        onToggleMute={noop}
        onTogglePause={noop}
        onVolume={noop}
        paused
        volume={0.8}
      />,
    );

    expect(html).toContain('aria-label="Play"');
    expect(html).toContain('aria-label="Unmute"');
    expect(html).toContain('value="0"');
  });
});

describe('ViewingControls', () => {
  it('offers danmaku, density and full screen controls', () => {
    const html = renderToStaticMarkup(
      <ViewingControls
        danmakuDensity="medium"
        danmakuVisible
        fullscreen={false}
        onDanmakuDensity={noop}
        onToggleDanmaku={noop}
        onToggleFullscreen={noop}
      />,
    );

    expect(html).toContain('aria-label="Hide danmaku"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Danmaku density"');
    expect(html).toContain('Medium density');
    expect(html).toContain('aria-label="Full screen"');
  });

  it('disables density while danmaku is hidden', () => {
    const html = renderToStaticMarkup(
      <ViewingControls
        danmakuDensity="low"
        danmakuVisible={false}
        fullscreen
        onDanmakuDensity={noop}
        onToggleDanmaku={noop}
        onToggleFullscreen={noop}
      />,
    );

    expect(html).toContain('aria-label="Show danmaku"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="Exit full screen"');
  });

  it('offers a video quality menu with the published layers', () => {
    const html = renderToStaticMarkup(
      <ViewingControls
        danmakuDensity="medium"
        danmakuVisible
        fullscreen={false}
        onDanmakuDensity={noop}
        onQuality={noop}
        onToggleDanmaku={noop}
        onToggleFullscreen={noop}
        quality={720}
        qualityOptions={[
          { label: 'Auto (1080p)', value: 'auto' },
          { label: '1080p', value: 1080 },
          { label: '720p', value: 720 },
          { label: '360p', value: 360 },
        ]}
      />,
    );

    expect(html).toContain('aria-label="Video quality"');
    expect(html).toContain('Auto (1080p)');
    expect(html).toContain('<option value="720" selected="">720p</option>');
    expect(html).toContain('360p');
  });

  it('keeps a saved choice the host does not send and hides the menu off-air', () => {
    const saved = renderToStaticMarkup(
      <ViewingControls
        danmakuDensity="medium"
        danmakuVisible
        fullscreen={false}
        onDanmakuDensity={noop}
        onQuality={noop}
        onToggleDanmaku={noop}
        onToggleFullscreen={noop}
        quality={1080}
        qualityOptions={[{ label: 'Auto', value: 'auto' }]}
      />,
    );
    expect(saved).toContain('<option value="1080" selected="">1080p</option>');

    const offAir = renderToStaticMarkup(
      <ViewingControls
        danmakuDensity="medium"
        danmakuVisible
        fullscreen={false}
        onDanmakuDensity={noop}
        onToggleDanmaku={noop}
        onToggleFullscreen={noop}
      />,
    );
    expect(offAir).not.toContain('Video quality');
  });
});
