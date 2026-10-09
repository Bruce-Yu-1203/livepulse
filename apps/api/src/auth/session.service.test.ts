import { describe, expect, it, vi } from 'vitest';

import { InvalidCredentialsError, InvalidSessionError } from './auth.errors.js';
import { AuthTokenService } from './auth-token.service.js';
import type { PasswordHasher } from './password-hasher.js';
import { SessionService } from './session.service.js';
import type {
  PasswordUser,
  SessionsRepository,
} from './sessions.repository.js';

const storedUser: PasswordUser = {
  createdAt: new Date('2026-10-09T01:00:00.000Z'),
  email: 'viewer@example.com',
  id: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
  passwordHash: 'stored-password-hash',
  role: 'VIEWER',
};

function createDependencies(
  user: PasswordUser | null | undefined = storedUser,
) {
  const passwordHasher: PasswordHasher = {
    hash: vi.fn(),
    verify: vi.fn().mockResolvedValue(Boolean(user)),
  };
  const sessions: SessionsRepository = {
    createSession: vi.fn().mockResolvedValue(undefined),
    findUserByEmail: vi.fn().mockResolvedValue(user ?? undefined),
    findUserById: vi.fn().mockResolvedValue(user ?? undefined),
    revokeSession: vi.fn().mockResolvedValue(undefined),
    rotateSession: vi.fn().mockResolvedValue(user ?? undefined),
  };
  const tokens = new AuthTokenService();

  return { passwordHasher, sessions, tokens };
}

describe('SessionService', () => {
  it('verifies a password and persists only the refresh-token hash', async () => {
    const dependencies = createDependencies();
    const service = new SessionService(
      dependencies.passwordHasher,
      dependencies.sessions,
      dependencies.tokens,
    );

    const result = await service.login({
      email: storedUser.email,
      password: 'correct horse battery staple',
    });

    expect(dependencies.passwordHasher.verify).toHaveBeenCalledWith(
      'correct horse battery staple',
      storedUser.passwordHash,
    );
    expect(dependencies.sessions.createSession).toHaveBeenCalledWith({
      expiresAt: result.refresh.expiresAt,
      id: result.refresh.sessionId,
      tokenHash: result.refresh.tokenHash,
      userId: storedUser.id,
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(
      dependencies.tokens.verifyCsrfToken(
        result.csrfToken,
        result.refresh.sessionId,
      ),
    ).toBe(true);
  });

  it('performs password work and returns one generic error for unknown users', async () => {
    const dependencies = createDependencies(null);
    const service = new SessionService(
      dependencies.passwordHasher,
      dependencies.sessions,
      dependencies.tokens,
    );

    await expect(
      service.login({
        email: 'missing@example.com',
        password: 'correct horse battery staple',
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(dependencies.passwordHasher.verify).toHaveBeenCalledOnce();
  });

  it('rotates a valid refresh token and rejects reuse', async () => {
    const dependencies = createDependencies();
    const original = dependencies.tokens.createRefreshCredentials();
    const service = new SessionService(
      dependencies.passwordHasher,
      dependencies.sessions,
      dependencies.tokens,
    );

    const result = await service.refresh(original.token);

    expect(dependencies.sessions.rotateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        currentTokenHash: original.tokenHash,
        id: original.sessionId,
        nextTokenHash: result.refresh.tokenHash,
      }),
    );
    expect(result.refresh.token).not.toBe(original.token);

    vi.mocked(dependencies.sessions.rotateSession).mockResolvedValueOnce(
      undefined,
    );
    await expect(service.refresh(original.token)).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
  });

  it('revokes a matching refresh session during logout', async () => {
    const dependencies = createDependencies();
    const refresh = dependencies.tokens.createRefreshCredentials();
    const service = new SessionService(
      dependencies.passwordHasher,
      dependencies.sessions,
      dependencies.tokens,
    );

    await service.logout(refresh.token);

    expect(dependencies.sessions.revokeSession).toHaveBeenCalledWith(
      refresh.sessionId,
      refresh.tokenHash,
      expect.any(Date),
    );
  });

  it('loads the current public user and rejects a deleted account', async () => {
    const dependencies = createDependencies();
    const service = new SessionService(
      dependencies.passwordHasher,
      dependencies.sessions,
      dependencies.tokens,
    );

    await expect(service.currentUser(storedUser.id)).resolves.toMatchObject({
      email: storedUser.email,
      id: storedUser.id,
    });

    vi.mocked(dependencies.sessions.findUserById).mockResolvedValueOnce(
      undefined,
    );
    await expect(service.currentUser(storedUser.id)).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
  });
});
