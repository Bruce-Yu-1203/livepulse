import { describe, expect, it } from 'vitest';

import { appendedChatMessageCount, isNearChatBottom } from './chat-scroll';

describe('chat scroll helpers', () => {
  it('follows only when the reader is near the bottom', () => {
    expect(
      isNearChatBottom({
        clientHeight: 400,
        scrollHeight: 1_000,
        scrollTop: 540,
      }),
    ).toBe(true);
    expect(
      isNearChatBottom({
        clientHeight: 400,
        scrollHeight: 1_000,
        scrollTop: 300,
      }),
    ).toBe(false);
  });

  it('counts appended messages without treating older history as new', () => {
    expect(
      appendedChatMessageCount('second', [
        { clientMessageId: 'older' },
        { clientMessageId: 'first' },
        { clientMessageId: 'second' },
        { clientMessageId: 'third' },
      ]),
    ).toBe(1);
    expect(
      appendedChatMessageCount('second', [
        { clientMessageId: 'older' },
        { clientMessageId: 'second' },
      ]),
    ).toBe(0);
    expect(
      appendedChatMessageCount(undefined, [{ clientMessageId: 'first' }]),
    ).toBe(0);
  });
});
