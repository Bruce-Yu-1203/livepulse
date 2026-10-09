import { Inject, Injectable } from '@nestjs/common';
import type { LoginRequest } from '@livepulse/contracts';

import { InvalidCredentialsError, InvalidSessionError } from './auth.errors.js';
import {
  anonymousCsrfContext,
  type AccessCredentials,
  AuthTokenService,
  type RefreshCredentials,
  type SessionUser,
} from './auth-token.service.js';
import { PASSWORD_HASHER, SESSIONS_REPOSITORY } from './auth.tokens.js';
import type { PasswordHasher } from './password-hasher.js';
import type { SessionsRepository } from './sessions.repository.js';

const timingProtectionHash = `scrypt$v1$16384$8$5$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export interface EstablishedSession {
  access: AccessCredentials;
  csrfToken: string;
  refresh: RefreshCredentials;
  user: SessionUser;
}

@Injectable()
export class SessionService {
  public constructor(
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessions: SessionsRepository,
    @Inject(AuthTokenService) private readonly tokens: AuthTokenService,
  ) {}

  public async login(input: LoginRequest): Promise<EstablishedSession> {
    const storedUser = await this.sessions.findUserByEmail(input.email);
    const passwordMatches = await this.passwordHasher.verify(
      input.password,
      storedUser?.passwordHash ?? timingProtectionHash,
    );

    if (!storedUser || !passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const user: SessionUser = {
      createdAt: storedUser.createdAt,
      email: storedUser.email,
      id: storedUser.id,
      role: storedUser.role,
    };
    const refresh = this.tokens.createRefreshCredentials();
    const access = await this.tokens.createAccessCredentials(
      user,
      refresh.sessionId,
    );

    await this.sessions.createSession({
      expiresAt: refresh.expiresAt,
      id: refresh.sessionId,
      tokenHash: refresh.tokenHash,
      userId: user.id,
    });

    return {
      access,
      csrfToken: this.tokens.createCsrfToken(refresh.sessionId),
      refresh,
      user,
    };
  }

  public async refresh(token: string | undefined): Promise<EstablishedSession> {
    const rotation = this.tokens.prepareRefreshRotation(token);

    if (!rotation) {
      throw new InvalidSessionError();
    }

    const user = await this.sessions.rotateSession({
      currentTokenHash: rotation.currentTokenHash,
      id: rotation.sessionId,
      nextExpiresAt: rotation.next.expiresAt,
      nextTokenHash: rotation.next.tokenHash,
      now: new Date(),
    });

    if (!user) {
      throw new InvalidSessionError();
    }

    const access = await this.tokens.createAccessCredentials(
      user,
      rotation.sessionId,
    );

    return {
      access,
      csrfToken: this.tokens.createCsrfToken(rotation.sessionId),
      refresh: rotation.next,
      user,
    };
  }

  public async currentUser(userId: string): Promise<SessionUser> {
    const user = await this.sessions.findUserById(userId);

    if (!user) {
      throw new InvalidSessionError();
    }

    return user;
  }

  public createCsrfToken(refreshToken: string | undefined): string {
    const context =
      this.tokens.readRefreshSessionId(refreshToken) ?? anonymousCsrfContext;
    return this.tokens.createCsrfToken(context);
  }

  public async logout(token: string | undefined): Promise<void> {
    const parsed = this.tokens.prepareRefreshRotation(token);

    if (parsed) {
      await this.sessions.revokeSession(
        parsed.sessionId,
        parsed.currentTokenHash,
        new Date(),
      );
    }
  }

  public get secureCookies(): boolean {
    return this.tokens.secureCookies;
  }
}
