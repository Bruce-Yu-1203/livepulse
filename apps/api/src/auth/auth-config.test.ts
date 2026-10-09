import { describe, expect, it } from 'vitest';

import { resolveAuthConfig } from './auth-config.js';

describe('resolveAuthConfig', () => {
  it('uses a development-only default and non-secure local cookies', () => {
    const config = resolveAuthConfig({
      accessTokenSecret: undefined,
      nodeEnvironment: 'development',
    });

    expect(config.accessTokenSecret.byteLength).toBeGreaterThanOrEqual(32);
    expect(config.secureCookies).toBe(false);
  });

  it('requires a strong explicit secret in production', () => {
    expect(() =>
      resolveAuthConfig({
        accessTokenSecret: undefined,
        nodeEnvironment: 'production',
      }),
    ).toThrow('ACCESS_TOKEN_SECRET is required in production');
    expect(() =>
      resolveAuthConfig({
        accessTokenSecret: 'short',
        nodeEnvironment: 'production',
      }),
    ).toThrow('ACCESS_TOKEN_SECRET must contain at least 32 bytes');
  });

  it('enables secure cookies in production', () => {
    expect(
      resolveAuthConfig({
        accessTokenSecret: 'a-production-secret-with-at-least-32-bytes',
        nodeEnvironment: 'production',
      }).secureCookies,
    ).toBe(true);
  });
});
