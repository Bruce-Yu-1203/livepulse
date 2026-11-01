import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StudioLiveChat } from './studio-live-chat';

describe('StudioLiveChat', () => {
  it('renders the room chat with a host-facing empty state', () => {
    const markup = renderToStaticMarkup(
      <StudioLiveChat
        room={{
          hostId: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
          id: '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
          status: 'LIVE',
        }}
      />,
    );

    expect(markup).toContain('aria-label="Live chat"');
    expect(markup).toContain('Messages from viewers appear here.');
    expect(markup).toContain('Connecting…');
    expect(markup).not.toContain('Collapse chat');
  });
});
