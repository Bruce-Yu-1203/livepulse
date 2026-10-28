import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  AdminDashboard,
  AuditHistoryPagination,
  AuditTrail,
  ModerationQueuePagination,
  ModerationReportActions,
  OperationsOverview,
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

  it('renders explicit audit activity without exposing hidden fields', () => {
    const html = renderToStaticMarkup(
      createElement(AuditTrail, {
        logs: [
          {
            action: 'REPORT_DISMISSED',
            actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            createdAt: '2026-10-11T16:00:00.000Z',
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            targetId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          },
        ],
      }),
    );

    expect(html).toContain('Report dismissed');
    expect(html).toContain('Open related room');
    expect(html).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('renders audit pagination feedback', () => {
    const html = renderToStaticMarkup(
      createElement(AuditHistoryPagination, {
        hasNextPage: true,
        loading: false,
        onLoad: () => undefined,
      }),
    );

    expect(html).toContain('Load more activity');
  });

  it('renders the operations summary without exposing sensitive data', () => {
    const html = renderToStaticMarkup(
      createElement(OperationsOverview, {
        onRefresh: () => undefined,
        refreshing: false,
        summary: {
          business: {
            auditActions: 8,
            liveRooms: 2,
            pendingReports: 1,
            users: 14,
          },
          generatedAt: '2026-10-16T20:01:00.000Z',
          requestId: 'request-1',
          runtime: {
            acceptedMessages: 120,
            acceptedMessagesLastMinute: 9,
            activeConnections: 4,
            deliveryAttempts: 480,
            redisFailures: 0,
            sessionCacheHits: 0,
            sessionRefreshes: 0,
            roomCacheHits: 0,
            roomCacheMisses: 0,
            muteCacheHits: 0,
            muteCacheMisses: 0,
            muteDbFallbacks: 0,
            muteInvalidationFailures: 0,
            startedAt: '2026-10-16T20:00:00.000Z',
          },
        },
      }),
    );

    expect(html).toContain('Runtime pulse');
    expect(html).toContain('Messages / min');
    expect(html).toContain('14 users');
    expect(html).not.toContain('request-1');
  });
});
