import { describe, expect, it, vi } from 'vitest';

import { bypassBenchmarkSignInIpLimit } from './benchmark-realtime-login.mjs';

describe('benchmark sign-in preparation', () => {
  it('bypasses only the HTTP sign-in IP limit', async () => {
    const consume = vi.fn().mockResolvedValue(250);
    const limiter = { consume };

    bypassBenchmarkSignInIpLimit(limiter);

    await expect(
      limiter.consume('signIn', '127.0.0.1'),
    ).resolves.toBeUndefined();
    await expect(
      limiter.consume('registrationStart', '127.0.0.1'),
    ).resolves.toBe(250);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith('registrationStart', '127.0.0.1');
  });
});
