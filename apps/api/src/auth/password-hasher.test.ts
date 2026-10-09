import { describe, expect, it } from 'vitest';

import { ScryptPasswordHasher } from './password-hasher.js';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('creates a salted hash that verifies the original password', async () => {
    const password = 'correct horse battery staple';
    const encodedHash = await hasher.hash(password);

    expect(encodedHash).not.toContain(password);
    expect(encodedHash).toMatch(/^scrypt\$v1\$16384\$8\$5\$/);
    await expect(hasher.verify(password, encodedHash)).resolves.toBe(true);
    await expect(hasher.verify('wrong-password', encodedHash)).resolves.toBe(
      false,
    );
  });

  it('uses a different random salt for the same password', async () => {
    const first = await hasher.hash('same-password-for-both-users');
    const second = await hasher.hash('same-password-for-both-users');

    expect(first).not.toBe(second);
  });

  it('rejects malformed or unsupported encoded hashes', async () => {
    await expect(hasher.verify('password', 'not-a-hash')).resolves.toBe(false);
    await expect(
      hasher.verify('password', 'argon2$v1$16384$8$5$00$00'),
    ).resolves.toBe(false);
    await expect(
      hasher.verify(
        'password',
        `scrypt$v1$16384$8$5$${'0'.repeat(32)}$${'0'.repeat(128)}$extra`,
      ),
    ).resolves.toBe(false);
  });
});
