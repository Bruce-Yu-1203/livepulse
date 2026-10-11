import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  AdminDashboard,
  ModerationQueuePagination,
  ModerationReportActions,
} from './admin-dashboard';

describe('AdminDashboard', () => {
  it('renders a non-sensitive loading shell before authorization resolves', () => {
    const html = renderToStaticMarkup(createElement(AdminDashboard));

    expect(html).toContain('Preparing the moderation queue');
    expect(html).not.toContain('Remove message');
  });

  it('offers both dismissal and message removal for a pending report', () => {
    const html = renderToStaticMarkup(
      createElement(ModerationReportActions, {
        onDelete: () => undefined,
        onDismiss: () => undefined,
        report: {
          createdAt: '2026-10-11T01:00:00.000Z',
          details: null,
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          message: {
            acceptedAt: '2026-10-11T00:59:00.000Z',
            authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            clientMessageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            messageId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            roomId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            text: 'Review this message',
          },
          messageId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          reason: 'OTHER',
          reporterId: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
          roomId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          status: 'PENDING',
        },
      }),
    );

    expect(html).toContain('Keep message');
    expect(html).toContain('Remove message');
  });

  it('renders pending feedback for moderation queue pagination', () => {
    const ready = renderToStaticMarkup(
      createElement(ModerationQueuePagination, {
        hasNextPage: true,
        loading: false,
        onLoad: () => undefined,
      }),
    );
    const loading = renderToStaticMarkup(
      createElement(ModerationQueuePagination, {
        hasNextPage: true,
        loading: true,
        onLoad: () => undefined,
      }),
    );

    expect(ready).toContain('Load more reports');
    expect(loading).toContain('Loading…');
    expect(loading).toContain('disabled=""');
  });
});
