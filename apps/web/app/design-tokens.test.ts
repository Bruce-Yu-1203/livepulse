import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = join(__dirname, '..');
const css = readFileSync(join(__dirname, 'globals.css'), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return path.endsWith('.tsx') && !path.includes('.test.') ? [path] : [];
  });
}

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

const tokens = [
  'canvas',
  'surface',
  'raised',
  'sunken',
  'fg',
  'fg-soft',
  'muted',
  'subtle',
  'line',
  'accent',
  'accent-hover',
  'on-accent',
  'danger',
  'success',
  'warning',
  'live',
];

describe('design tokens', () => {
  it('defines every semantic colour for both light and dark themes', () => {
    const light = block(':root');
    const dark = block(":root[data-theme='dark']");

    for (const token of tokens) {
      expect(light).toContain(`--lp-${token}:`);
      expect(dark).toContain(`--lp-${token}:`);
    }
  });

  it('uses semantic colours for shared feedback tones', () => {
    expect(block(".status-notice[data-tone='error']")).toContain(
      'var(--lp-danger)',
    );
    expect(block(".status-notice[data-tone='success']")).toContain(
      'var(--lp-success)',
    );
    expect(block(".status-notice[data-tone='warning']")).toContain(
      'var(--lp-warning)',
    );
  });

  it('exposes the tokens to Tailwind utilities', () => {
    for (const token of tokens) {
      expect(css).toContain(`--color-${token}: var(--lp-${token});`);
    }
  });

  it('keeps raw Tailwind palette colours out of components', () => {
    const palette =
      /\b(?:text|bg|border|ring|accent|placeholder:text)-(?:zinc|cyan|rose|emerald|amber|violet|slate|gray|neutral)-\d+/;
    const offenders = [
      ...sourceFiles(join(webRoot, 'app')),
      ...sourceFiles(join(webRoot, 'components')),
    ].filter((file) => palette.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('uses no hard-coded hex colours in component class names', () => {
    const offenders = [
      ...sourceFiles(join(webRoot, 'app')),
      ...sourceFiles(join(webRoot, 'components')),
    ].filter((file) =>
      /(?:bg|text|border)-\[#/.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });

  it('animates the logo signal on hover and respects reduced motion', () => {
    expect(css).toContain('.site-brand:hover .brand-mark-core');
    expect(css).toContain('@keyframes signal-arc');
    const reducedBlocks = css.split('prefers-reduced-motion').slice(1);
    expect(
      reducedBlocks.some((block) =>
        block.includes('.site-brand:hover .brand-mark-outer'),
      ),
    ).toBe(true);
  });

  it('hides stage controls until hover and keeps them for touch and keyboard', () => {
    expect(block('.stage-overlay')).toContain('opacity: 0');
    expect(css).toContain('.room-stage:hover .stage-overlay');
    expect(css).toContain('.room-stage:focus-within .stage-overlay');
    expect(css).toContain('@media (hover: none)');
    expect(css).toContain('.chat-message:hover');
  });

  it('keeps mobile room controls reachable and the chat list bounded', () => {
    expect(css).toContain('.room-stage:not(:fullscreen) .stage-controls');
    expect(css).toContain('width: 2.75rem');
    expect(css).toContain('height: 2.75rem');
    expect(block('.room-chat-list')).toContain('max-height: min(48dvh, 26rem)');
    expect(block('.room-chat-panel')).toContain('min-height: 0');
  });

  it('styles a collapsed channel rail', () => {
    expect(block('.channel-rail-collapsed')).toContain('width: 3.75rem');
  });

  it('keeps the registration dialog within the latest shell design', () => {
    const modal = block('.auth-modal');
    expect(modal).toContain('width: min(30rem, calc(100vw - 2rem))');
    expect(modal).toContain('overflow: hidden');
    expect(block('.auth-panel')).toContain('background: var(--lp-surface)');
  });
});

describe('stage framing', () => {
  it('fills letterboxed streams with a blurred, cropped copy', () => {
    const fill = block('.stage-fill');
    expect(fill).toContain('object-fit: cover');
    expect(fill).toContain('filter: blur(');
  });

  it('keeps the featured media at 16:9 so covers are not cropped', () => {
    expect(block('.featured-media')).toContain('aspect-ratio: 16 / 9');
  });
});

describe('motion', () => {
  it('animates chat entry but turns it off during bursts and reduced motion', () => {
    expect(block('.chat-message')).toContain('animation: chat-message-in');
    expect(block('.room-chat-list-busy .chat-message')).toContain(
      'animation: none',
    );
    const reducedBlocks = css.split('prefers-reduced-motion').slice(1);
    expect(
      reducedBlocks.some(
        (part) => part.includes('.chat-message') && part.includes('.like-plus'),
      ),
    ).toBe(true);
  });

  it('pulses live dots', () => {
    expect(block('.channel-dot')).toContain('animation: live-dot-pulse');
  });
});
