import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';

import {
  accessTokenLifetimeSeconds,
  refreshTokenLifetimeSeconds,
  resolveAuthConfig,
} from './auth-config.js';

const issuer = 'livepulse-api';
const audience = 'livepulse-web';
const refreshTokenPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i;

export const accessCookieName = 'lp_access';
export const refreshCookieName = 'lp_refresh';

export interface SessionUser {
  createdAt: Date;
  email: string;
  id: string;
  role: 'ADMIN' | 'HOST' | 'VIEWER';
}

export interface RefreshCredentials {
  expiresAt: Date;
  sessionId: string;
  token: string;
  tokenHash: string;
}

export interface AccessCredentials {
  expiresAt: Date;
  token: string;
}

@Injectable()
export class AuthTokenService {
  private readonly config = resolveAuthConfig({
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
    nodeEnvironment: process.env.NODE_ENV,
  });

  public createRefreshCredentials(
    now = new Date(),
    sessionId: string = randomUUID(),
  ): RefreshCredentials {
    const token = `${sessionId}.${randomBytes(32).toString('base64url')}`;

    return {
      expiresAt: new Date(now.getTime() + refreshTokenLifetimeSeconds * 1_000),
      sessionId,
      token,
      tokenHash: this.hashRefreshToken(token),
    };
  }

  public prepareRefreshRotation(
    token: string | undefined,
    now = new Date(),
  ):
    | {
        currentTokenHash: string;
        next: RefreshCredentials;
        sessionId: string;
      }
    | undefined {
    const parsed = token?.match(refreshTokenPattern);
    const sessionId = parsed?.[1];

    if (!token || !sessionId) {
      return undefined;
    }

    return {
      currentTokenHash: this.hashRefreshToken(token),
      next: this.createRefreshCredentials(now, sessionId),
      sessionId,
    };
  }

  public async createAccessCredentials(
    user: SessionUser,
    sessionId: string,
    now = new Date(),
  ): Promise<AccessCredentials> {
    const issuedAt = Math.floor(now.getTime() / 1_000);
    const expiresAtSeconds = issuedAt + accessTokenLifetimeSeconds;
    const token = await new SignJWT({ role: user.role, sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setAudience(audience)
      .setExpirationTime(expiresAtSeconds)
      .setIssuedAt(issuedAt)
      .setIssuer(issuer)
      .setSubject(user.id)
      .sign(this.config.accessTokenSecret);

    return {
      expiresAt: new Date(expiresAtSeconds * 1_000),
      token,
    };
  }

  public async verifyAccessToken(token: string, now = new Date()) {
    return jwtVerify(token, this.config.accessTokenSecret, {
      algorithms: ['HS256'],
      audience,
      currentDate: now,
      issuer,
    });
  }

  public get secureCookies(): boolean {
    return this.config.secureCookies;
  }

  public hashRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
