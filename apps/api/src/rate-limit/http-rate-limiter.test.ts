import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpRateLimiter } from './http-rate-limiter.js';

describe('HTTP IP token buckets', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('REDIS_URL', undefined);
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-rate-limit-secret');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('limits registration starts per IP and refills with time', async () => {
    const limiter = new HttpRateLimiter();
    for (let index = 0; index < 60; index += 1) {
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

  it('keeps authenticated users separate behind one IP', async () => {
    const limiter = new HttpRateLimiter();
    for (let index = 0; index < 6; index += 1) {
      await expect(
        limiter.consumeIdentity('avatarUploadUser', 'user-one'),
      ).resolves.toBeUndefined();
    }
    await expect(
      limiter.consumeIdentity('avatarUploadUser', 'user-one'),
    ).resolves.toBe(60_000);
    await expect(
      limiter.consumeIdentity('avatarUploadUser', 'user-two'),
    ).resolves.toBeUndefined();
  });

  it('reserves five email sends in a rolling ten-minute window and releases failed sends', async () => {
    const limiter = new HttpRateLimiter();
    const reservations: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const result = await limiter.reserveIdentity(
        'registrationEmail',
        'viewer@example.com',
      );
      expect(result).toHaveProperty('reservationId');
      if ('reservationId' in result) reservations.push(result.reservationId);
    }
    await expect(
      limiter.reserveIdentity('registrationEmail', 'viewer@example.com'),
    ).resolves.toEqual({ retryAfterMs: 600_000 });
    await limiter.releaseIdentity(
      'registrationEmail',
      'viewer@example.com',
      reservations[0]!,
    );
    await expect(
      limiter.reserveIdentity('registrationEmail', 'viewer@example.com'),
    ).resolves.toHaveProperty('reservationId');
    await expect(
      limiter.reserveIdentity('registrationEmail', 'other@example.com'),
    ).resolves.toHaveProperty('reservationId');
    vi.advanceTimersByTime(600_000);
    await expect(
      limiter.reserveIdentity('registrationEmail', 'viewer@example.com'),
    ).resolves.toHaveProperty('reservationId');
  });

  it('shares failed login reservations across IPs and frees successful attempts', async () => {
    const limiter = new HttpRateLimiter();
    const success = await limiter.reserveIdentity(
      'signInEmailFailures',
      'viewer@example.com',
    );
    if (!('reservationId' in success))
      throw new Error('Expected a reservation');
    await limiter.releaseIdentity(
      'signInEmailFailures',
      'viewer@example.com',
      success.reservationId,
    );
    for (let index = 0; index < 10; index += 1) {
      await expect(
        limiter.reserveIdentity('signInEmailFailures', 'viewer@example.com'),
      ).resolves.toHaveProperty('reservationId');
    }
    await expect(
      limiter.reserveIdentity('signInEmailFailures', 'viewer@example.com'),
    ).resolves.toEqual({ retryAfterMs: 600_000 });
  });
});
