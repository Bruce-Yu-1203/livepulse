import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MessageReportForm, reportReasonOptions } from './message-report-form';

describe('MessageReportForm', () => {
  it('starts as a compact report action', () => {
    const html = renderToStaticMarkup(
      createElement(MessageReportForm, {
        messageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        roomId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    );

    expect(html).toContain('Report message');
    expect(html).not.toContain('Submit report');
  });

  it('offers every reason accepted by the API contract', () => {
    expect(reportReasonOptions.map(({ value }) => value)).toEqual([
      'SPAM',
      'HARASSMENT',
      'HATE_SPEECH',
      'OTHER',
    ]);
  });
});
