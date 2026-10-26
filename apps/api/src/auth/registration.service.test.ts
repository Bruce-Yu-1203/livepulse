import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service.js';
import type { BetterAuthService } from './better-auth.service.js';
import {
  hashRegistrationCode,
  RegistrationService,
} from './registration.service.js';
import type { ResendVerificationEmail } from './resend-verification-email.js';
import type { TurnstileVerifier } from './turnstile-verifier.js';

describe('registration code hashing', () => {
  it('binds a code to the email and secret without storing the code', () => {
    const hash = hashRegistrationCode(
      'a-private-server-secret',
      'viewer@example.com',
      '123456',
    );

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('123456');
    expect(hash).toBe(
      hashRegistrationCode(
        'a-private-server-secret',
        'viewer@example.com',
        '123456',
      ),
    );
    expect(hash).not.toBe(
      hashRegistrationCode(
        'a-private-server-secret',
        'other@example.com',
        '123456',
      ),
    );
    expect(hash).not.toBe(
      hashRegistrationCode(
        'a-private-server-secret',
        'viewer@example.com',
        '654321',
      ),
    );
  });
});

describe('registration start', () => {
  it('does not read or write registration data or send email when Turnstile rejects', async () => {
    const findUnique = vi.fn();
    const send = vi.fn();
    const verify = vi
      .fn()
      .mockRejectedValue(
        new HttpException(
          { code: 'AUTH_TURNSTILE_FAILED', message: 'Verification failed' },
          403,
        ),
      );
    const registration = new RegistrationService(
      { client: { user: { findUnique } } } as unknown as DatabaseService,
      {} as BetterAuthService,
      { send } as unknown as ResendVerificationEmail,
      { verify } as unknown as TurnstileVerifier,
    );

    await expect(
      registration.start(
        {
          email: 'viewer@example.com',
          username: 'viewer_one',
          password: 'securepass123',
          turnstileToken: 'bad-token',
        },
        '203.0.113.42',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(verify).toHaveBeenCalledWith('bad-token', '203.0.113.42');
    expect(findUnique).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
