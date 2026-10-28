import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StatusNotice } from './status-notice';

describe('StatusNotice', () => {
  it('keeps error feedback visible and announced in context', () => {
    const html = renderToStaticMarkup(
      <StatusNotice className="mt-3" compact role="alert" tone="error">
        Please try again.
      </StatusNotice>,
    );

    expect(html).toContain('data-tone="error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('status-notice-compact');
    expect(html).toContain('Please try again.');
  });

  it('uses a consistent status role for success and information', () => {
    const success = renderToStaticMarkup(
      <StatusNotice tone="success">Saved.</StatusNotice>,
    );
    const information = renderToStaticMarkup(
      <StatusNotice>Connecting…</StatusNotice>,
    );

    expect(success).toContain('data-tone="success" role="status"');
    expect(information).toContain('data-tone="info" role="status"');
  });
});
