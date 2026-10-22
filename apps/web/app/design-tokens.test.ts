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

  it('styles a collapsed channel rail', () => {
    expect(block('.channel-rail-collapsed')).toContain('width: 3.75rem');
  });
});
