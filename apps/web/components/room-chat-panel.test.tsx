import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RoomChatPanel, type RoomChatState } from './room-chat-panel';

const hostId = '295d5bd9-d9da-44b2-8f5d-8839f13a4437';
const viewerId = '7a1c2f3e-0000-4000-8000-000000000001';
const room = {
  hostId,
  id: '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
  status: 'LIVE' as const,
};

describe('RoomChatPanel', () => {
  it('lets the host read and moderate the live chat', () => {
    const markup = renderToStaticMarkup(
      <RoomChatPanel
        chat={chatState({
          messages: [
            {
              acceptedAt: '2026-11-01T00:00:00.000Z',
              authorId: viewerId,
              clientMessageId: 'c1',
              id: 'm1',
              status: 'sent',
              text: 'Hello host',
            },
          ],
          userId: hostId,
          userRole: 'HOST',
        })}
        emptyHint="Messages from viewers appear here."
        label="Viewer chat"
        room={room}
      />,
    );

    expect(markup).toContain('aria-label="Viewer chat"');
    expect(markup).toContain('Hello host');
    expect(markup).toContain('Mute 10m');
    expect(markup).toContain('aria-label="Chat message"');
    expect(markup).toContain('2 people online');
    // The studio panel has no collapse control.
    expect(markup).not.toContain('Collapse chat');
  });

  it('shows the empty hint and the collapse control when one is given', () => {
    const markup = renderToStaticMarkup(
      <RoomChatPanel
        chat={chatState({ userId: viewerId, userRole: 'VIEWER' })}
        emptyHint="Messages from viewers appear here."
        onCollapse={vi.fn()}
        room={room}
      />,
    );

    expect(markup).toContain('aria-label="Live chat"');
    expect(markup).toContain('Messages from viewers appear here.');
    expect(markup).toContain('Collapse chat');
    expect(markup).not.toContain('Mute 10m');
  });

  it('closes the composer once the broadcast has ended', () => {
    const markup = renderToStaticMarkup(
      <RoomChatPanel
        chat={chatState({ connection: 'ended', userId: hostId })}
        room={{ ...room, status: 'ENDED' }}
      />,
    );

    expect(markup).toContain('Chat closed when this broadcast ended.');
    expect(markup).not.toContain('aria-label="Chat message"');
  });
});

function chatState(overrides: Partial<RoomChatState> = {}): RoomChatState {
  return {
    authChecked: true,
    canLoadEarlier: false,
    connection: 'connected',
    danmakuMessages: [],
    error: undefined,
    historyLoading: false,
    loadEarlier: vi.fn(),
    messages: [],
    onlineCount: 2,
    sendMessage: vi.fn().mockReturnValue(true),
    synchronize: vi.fn(),
    uniqueUserCount: 2,
    userId: undefined,
    userRole: undefined,
    ...overrides,
  };
}
