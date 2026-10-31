import type { Room } from '@livepulse/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { HostBroadcastStudio } from './host-broadcast-studio';

describe('HostBroadcastStudio', () => {
  it('requires a local preview before the host can start broadcasting', () => {
    const markup = renderToStaticMarkup(
      <HostBroadcastStudio
        disabled={false}
        onAbort={vi.fn().mockResolvedValue(undefined)}
        onEnd={vi.fn().mockResolvedValue(true)}
        onGoLive={vi.fn().mockResolvedValue(true)}
        onPrepare={vi.fn().mockResolvedValue(draftRoom())}
      />,
    );

    expect(markup).toContain('Share screen');
    expect(markup).toContain('checked=""');
    expect(markup).toContain('Use camera');
    expect(markup).toContain('Camera input');
    expect(markup).toContain('Microphone input');
    expect(markup).toContain('Choose a screen');
    expect(markup).toContain('Prepare a screen or camera preview first.');
    expect(markup).toContain('Start live broadcast');
  });

  it('offers reconnection and ending for a live broadcast', () => {
    const markup = renderToStaticMarkup(
      <HostBroadcastStudio
        disabled={false}
        onAbort={vi.fn().mockResolvedValue(undefined)}
        onEnd={vi.fn().mockResolvedValue(true)}
        onGoLive={vi.fn().mockResolvedValue(true)}
        onPrepare={vi.fn().mockResolvedValue(draftRoom())}
        room={{ ...draftRoom(), status: 'LIVE' }}
      />,
    );
    expect(markup).toContain('Reconnect broadcast');
    expect(markup).toContain('End broadcast');
    expect(markup).not.toContain('Confirm end');
    expect(markup).not.toContain('Before you go live');
  });

  it('shows the details panel and a checklist before going live', () => {
    const markup = renderToStaticMarkup(
      <HostBroadcastStudio
        details={<h2>Stream info</h2>}
        detailsReady={false}
        disabled={false}
        onAbort={vi.fn().mockResolvedValue(undefined)}
        onEnd={vi.fn().mockResolvedValue(true)}
        onGoLive={vi.fn().mockResolvedValue(true)}
        onPrepare={vi.fn().mockResolvedValue(draftRoom())}
      />,
    );

    expect(markup).toContain('<h2>Stream info</h2>');
    expect(markup).toContain('aria-label="Before you go live"');
    expect(markup).toContain('Title and description');
    expect(markup).toContain('Video preview');
    expect(markup).toContain('Microphone on');
    expect(markup).toContain('role="switch"');
    expect(markup).not.toContain('End broadcast');
  });
});

function draftRoom(): Room {
  return {
    category: 'just-chatting',
    coverImageUrl: null,
    createdAt: '2026-10-19T20:00:00.000Z',
    description: 'A live product demonstration',
    hostId: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
    id: '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
    likeCount: 0,
    status: 'DRAFT',
    title: 'Live room',
    updatedAt: '2026-10-19T20:00:00.000Z',
    version: 1,
  };
}
