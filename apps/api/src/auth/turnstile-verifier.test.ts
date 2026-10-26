import { HttpException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TurnstileVerifier } from './turnstile-verifier.js';

describe('Turnstile site verification', () => {
  beforeEach(() => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'server-secret');
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends the token and client IP to Cloudflare', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

    await expect(
      new TurnstileVerifier().verify('user-token', '203.0.113.42'),
    ).resolves.toBeUndefined();
    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    );
    expect(options?.method).toBe('POST');
    const body = options?.body as URLSearchParams;
    expect(body.get('secret')).toBe('server-secret');
    expect(body.get('response')).toBe('user-token');
    expect(body.get('remoteip')).toBe('203.0.113.42');
  });

  it('rejects failed verification with 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    );

    await expect(
      new TurnstileVerifier().verify('bad-token', '203.0.113.42'),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'AUTH_TURNSTILE_FAILED' },
    });
  });

  it('fails closed if Cloudflare cannot respond or the secret is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));
    await expect(
      new TurnstileVerifier().verify('token', '203.0.113.42'),
    ).rejects.toMatchObject({ status: 503 });

    vi.stubEnv('TURNSTILE_SECRET_KEY', undefined);
    await expect(
      new TurnstileVerifier().verify('token', '203.0.113.42'),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects Cloudflare test secrets in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA');
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(
      new TurnstileVerifier().verify('token', '203.0.113.42'),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
