import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChatJumpButton } from './chat-jump-button';

describe('ChatJumpButton', () => {
  it('announces unread messages and offers a touch-sized return target', () => {
    const html = renderToStaticMarkup(
      <ChatJumpButton count={3} onClick={() => undefined} />,
    );

    expect(html).toContain('Jump to latest messages, 3 new');
    expect(html).toContain('3 new messages · Latest');
    expect(html).toContain('min-h-11');
  });

  it('stays hidden without new messages', () => {
    expect(
      renderToStaticMarkup(
        <ChatJumpButton count={0} onClick={() => undefined} />,
      ),
    ).toBe('');
  });
});
