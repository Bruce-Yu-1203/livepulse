import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CategoryPicker } from './category-picker';

describe('CategoryPicker', () => {
  it('offers every category as a radio option with the current one checked', () => {
    const markup = renderToStaticMarkup(
      <CategoryPicker
        disabled={false}
        hint="Defaults to the category you used last time."
        onChange={() => undefined}
        value="irl"
      />,
    );
    expect(markup.match(/type="radio"/g)).toHaveLength(9);
    expect(markup).toContain('<legend');
    expect(markup).toContain('value="irl"');
    expect(markup).toMatch(
      /data-selected="true"><input [^>]*checked=""[^>]*value="irl"/,
    );
    expect(markup).toContain('Art &amp; Making');
    expect(markup).toContain('Defaults to the category you used last time.');
  });

  it('disables every option while a request is pending', () => {
    const markup = renderToStaticMarkup(
      <CategoryPicker disabled onChange={() => undefined} value="gaming" />,
    );
    expect(markup).toContain('<fieldset class="category-picker" disabled=""');
  });
});
