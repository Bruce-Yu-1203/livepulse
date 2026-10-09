import { describe, expect, it } from 'vitest';

import { readBrowserCookie } from './browser-cookies';

describe('readBrowserCookie', () => {
  it('reads and decodes the requested cookie', () => {
    expect(
      readBrowserCookie(
        'theme=dark; lp_csrf=nonce.signature%2Fvalue',
        'lp_csrf',
      ),
    ).toBe('nonce.signature/value');
  });

  it('does not match cookie-name prefixes', () => {
    expect(readBrowserCookie('lp_csrf_old=value', 'lp_csrf')).toBeUndefined();
  });
});
