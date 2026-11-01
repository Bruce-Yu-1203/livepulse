import { describe, expect, it } from 'vitest';

import { isInAppNavigation, type LeaveClick } from './studio-leave-guard';

const current = new URL('https://livepulse.tech/studio');
const plainClick: LeaveClick = {
  altKey: false,
  button: 0,
  ctrlKey: false,
  defaultPrevented: false,
  metaKey: false,
  shiftKey: false,
};

function anchor(href: string, target = '', download = false) {
  return { download, href, target };
}

describe('isInAppNavigation', () => {
  it('flags same-tab links to other pages of the app', () => {
    expect(isInAppNavigation(plainClick, anchor('/rooms/abc'), current)).toBe(
      true,
    );
    expect(
      isInAppNavigation(
        plainClick,
        anchor('https://livepulse.tech/?q=music'),
        current,
      ),
    ).toBe(true);
  });

  it('ignores links that keep the studio open', () => {
    expect(
      isInAppNavigation(plainClick, anchor('/rooms/abc', '_blank'), current),
    ).toBe(false);
    expect(isInAppNavigation(plainClick, anchor('/studio#chat'), current)).toBe(
      false,
    );
    expect(
      isInAppNavigation(plainClick, anchor('https://example.com/'), current),
    ).toBe(false);
    expect(
      isInAppNavigation(plainClick, anchor('/export.csv', '', true), current),
    ).toBe(false);
  });

  it('ignores modified, non-primary and already handled clicks', () => {
    for (const click of [
      { ...plainClick, metaKey: true },
      { ...plainClick, ctrlKey: true },
      { ...plainClick, shiftKey: true },
      { ...plainClick, button: 1 },
      { ...plainClick, defaultPrevented: true },
    ]) {
      expect(isInAppNavigation(click, anchor('/rooms/abc'), current)).toBe(
        false,
      );
    }
  });
});
