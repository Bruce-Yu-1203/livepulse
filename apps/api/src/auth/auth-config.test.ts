import { describe, expect, it } from 'vitest';

import { resolveAuthConfig } from './auth-config.js';

describe('resolveAuthConfig', () => {
  it('uses development-only defaults for local auth', () => {
    const config = resolveAuthConfig({
      authSecret: undefined,
      nodeEnvironment: 'development',
    });

    expect(Buffer.byteLength(config.authSecret)).toBeGreaterThanOrEqual(32);
    expect(config.apiOrigin).toBe('http://localhost:3001');
    expect(config.cookieDomain).toBeUndefined();
    expect(config.google).toBeUndefined();
    expect(config.secureCookies).toBe(false);
    expect(config.webOrigin).toBe('http://localhost:3000');
  });

  it('accepts a shared cookie hostname and rejects URLs', () => {
    expect(
      resolveAuthConfig({
        authSecret: undefined,
        cookieDomain: '.livepulse.example',
        nodeEnvironment: 'development',
      }).cookieDomain,
    ).toBe('.livepulse.example');

    expect(() =>
      resolveAuthConfig({
        authSecret: undefined,
        cookieDomain: 'https://livepulse.example',
        nodeEnvironment: 'development',
      }),
    ).toThrow('AUTH_COOKIE_DOMAIN must be a hostname without a scheme');
  });

  it('enables Google only when both OAuth credentials are configured', () => {
    expect(
      resolveAuthConfig({
        authSecret: undefined,
        googleClientId: ' google-client-id ',
        googleClientSecret: ' google-client-secret ',
        nodeEnvironment: 'development',
      }).google,
    ).toEqual({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
    });

    expect(() =>
      resolveAuthConfig({
        authSecret: undefined,
        googleClientId: 'google-client-id',
        nodeEnvironment: 'development',
      }),
    ).toThrow(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together',
    );
  });

  it('requires a strong explicit secret in production', () => {
    expect(() =>
      resolveAuthConfig({
        authSecret: undefined,
        nodeEnvironment: 'production',
      }),
    ).toThrow('BETTER_AUTH_SECRET is required in production');
    expect(() =>
      resolveAuthConfig({
        authSecret: 'short',
        nodeEnvironment: 'production',
      }),
    ).toThrow('BETTER_AUTH_SECRET must contain at least 32 bytes');
  });

  it('enables secure cookies and normalizes production origins', () => {
    const config = resolveAuthConfig({
      apiOrigin: 'https://api.livepulse.example/path',
      authSecret: 'a-production-secret-with-at-least-32-bytes',
      nodeEnvironment: 'production',
      webOrigin: 'https://livepulse.example/path',
    });

    expect(config.apiOrigin).toBe('https://api.livepulse.example');
    expect(config.secureCookies).toBe(true);
    expect(config.webOrigin).toBe('https://livepulse.example');
  });

  it('requires both production origins', () => {
    const environment = {
      authSecret: 'a-production-secret-with-at-least-32-bytes',
      nodeEnvironment: 'production',
    } as const;

    expect(() => resolveAuthConfig(environment)).toThrow(
      'WEB_ORIGIN is required in production',
    );
    expect(() =>
      resolveAuthConfig({
        ...environment,
        webOrigin: 'https://livepulse.example',
      }),
    ).toThrow('BETTER_AUTH_URL is required in production');
  });
});
