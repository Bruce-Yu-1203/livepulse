import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpRateLimiter } from './http-rate-limiter.js';

describe('HTTP IP token buckets', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('REDIS_URL', undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('limits registration starts per IP and refills with time', async () => {
    const limiter = new HttpRateLimiter();
    for (let index = 0; index < 20; index += 1) {
      await expect(
        limiter.consume('registrationStart', '203.0.113.10'),
      ).resolves.toBeUndefined();
    }
    await expect(
      limiter.consume('registrationStart', '203.0.113.10'),
    ).resolves.toBe(30_000);
    vi.advanceTimersByTime(30_000);
    await expect(
      limiter.consume('registrationStart', '203.0.113.10'),
    ).resolves.toBeUndefined();
  });

  it('keeps IPs and route policies independent', async () => {
    const limiter = new HttpRateLimiter();
    for (let index = 0; index < 20; index += 1) {
      await limiter.consume('registrationStart', '203.0.113.10');
    }
    await expect(
      limiter.consume('registrationStart', '203.0.113.11'),
    ).resolves.toBeUndefined();
    await expect(
      limiter.consume('registrationComplete', '203.0.113.10'),
    ).resolves.toBeUndefined();
  });
});
