import { describe, expect, it } from 'vitest';

import { hashRegistrationCode } from './registration.service.js';

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
