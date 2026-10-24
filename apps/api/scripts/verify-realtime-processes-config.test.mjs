import { describe, expect, it } from 'vitest';

import { secondLocalApiOrigin } from './verify-realtime-processes-config.mjs';

describe('two-process realtime verification configuration', () => {
  it('requires a distinct local HTTP origin with a port', () => {
    const first = 'http://127.0.0.1:3101';
    expect(secondLocalApiOrigin(first, 'http://127.0.0.1:3102')).toBe(
      'http://127.0.0.1:3102',
    );
    for (const invalid of [
      first,
      'https://127.0.0.1:3102',
      'http://remote.example:3102',
      'http://127.0.0.1',
      'invalid',
    ]) {
      expect(() => secondLocalApiOrigin(first, invalid)).toThrow(
        /distinct local HTTP origin/u,
      );
    }
  });
});
