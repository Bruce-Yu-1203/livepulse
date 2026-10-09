import { describe, expect, it, vi } from 'vitest';

import { EmailAlreadyExistsError } from './auth.errors.js';
import type { PasswordHasher } from './password-hasher.js';
import { RegistrationService } from './registration.service.js';
import type { UsersRepository } from './users.repository.js';

describe('RegistrationService', () => {
  it('hashes the password before passing a new viewer to the repository', async () => {
    const passwordHasher: PasswordHasher = {
      hash: vi.fn().mockResolvedValue('stored-password-hash'),
      verify: vi.fn(),
    };
    const users: UsersRepository = {
      create: vi.fn().mockResolvedValue({
        createdAt: new Date('2026-10-09T01:00:00.000Z'),
        email: 'viewer@example.com',
        id: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
        role: 'VIEWER',
      }),
    };
    const service = new RegistrationService(passwordHasher, users);

    const result = await service.register({
      email: 'viewer@example.com',
      password: 'correct horse battery staple',
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith(
      'correct horse battery staple',
    );
    expect(users.create).toHaveBeenCalledWith({
      email: 'viewer@example.com',
      passwordHash: 'stored-password-hash',
    });
    expect(result.role).toBe('VIEWER');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('preserves a repository duplicate-email error', async () => {
    const passwordHasher: PasswordHasher = {
      hash: vi.fn().mockResolvedValue('stored-password-hash'),
      verify: vi.fn(),
    };
    const users: UsersRepository = {
      create: vi.fn().mockRejectedValue(new EmailAlreadyExistsError()),
    };
    const service = new RegistrationService(passwordHasher, users);

    await expect(
      service.register({
        email: 'viewer@example.com',
        password: 'correct horse battery staple',
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyExistsError);
  });
});
