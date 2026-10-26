import { describe, expect, it, vi } from 'vitest';

import type { HttpRateLimiter } from './http-rate-limiter.js';
import { enforceIdentityRateLimit } from './enforce-identity-rate-limit.js';

describe('authenticated HTTP rate limits', () => {
  it('uses the authenticated user as the quota identity', async () => {
    const consumeIdentity = vi.fn().mockResolvedValue(undefined);
    await enforceIdentityRateLimit(
      { consumeIdentity } as unknown as HttpRateLimiter,
      'avatarUploadUser',
      'user-one',
    );
    expect(consumeIdentity).toHaveBeenCalledWith(
      'avatarUploadUser',
      'user-one',
    );
  });

  it('returns a retry time without invoking the protected action', async () => {
    const consumeIdentity = vi.fn().mockResolvedValue(2_100);
    await expect(
      enforceIdentityRateLimit(
        { consumeIdentity } as unknown as HttpRateLimiter,
        'reportCreateUser',
        'user-one',
      ),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('fails closed when Redis is unavailable', async () => {
    const consumeIdentity = vi
      .fn()
      .mockRejectedValue(new Error('Redis offline'));
    await expect(
      enforceIdentityRateLimit(
        { consumeIdentity } as unknown as HttpRateLimiter,
        'reportCreateUser',
        'user-one',
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
