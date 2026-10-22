import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BrandMark } from './brand-mark';

describe('BrandMark', () => {
  it('uses the beacon motif in the interface and browser icon', () => {
    const mark = renderToStaticMarkup(<BrandMark />);
    const icon = readFileSync(
      new URL('../app/icon.svg', import.meta.url),
      'utf8',
    );

    expect(mark).toContain('M17 12C3 26 3 54 17 68');
    expect(mark).toContain('fill="#F0384F"');
    expect(icon).toContain('M17 12C3 26 3 54 17 68');
    expect(icon).toContain('fill="#F0384F"');
  });

  it('names each signal part so the logo can animate on hover', () => {
    const mark = renderToStaticMarkup(<BrandMark />);

    expect(mark).toContain('brand-mark-outer');
    expect(mark).toContain('brand-mark-inner');
    expect(mark).toContain('brand-mark-core');
  });
});
