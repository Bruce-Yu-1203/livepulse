import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';

import {
  accessTokenLifetimeSeconds,
  refreshTokenLifetimeSeconds,
  resolveAuthConfig,
} from './auth-config.js';
import type { AuthenticatedPrincipal } from './authenticated-request.js';

const issuer = 'livepulse-api';
const audience = 'livepulse-web';
const refreshTokenPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i;
const csrfTokenPattern = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const authenticatedRoles = new Set(['ADMIN', 'HOST', 'VIEWER']);

export const accessCookieName = 'lp_access';
export const anonymousCsrfContext = 'anonymous';
export const csrfCookieName = 'lp_csrf';
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
    webOrigin: process.env.WEB_ORIGIN,
  });
  private readonly csrfSigningKey = createHmac(
    'sha256',
    this.config.accessTokenSecret,
  )
    .update('livepulse-csrf-key-v1', 'utf8')
    .digest();

  public createCsrfToken(context: string): string {
    const nonce = randomBytes(32).toString('base64url');
    return `${nonce}.${this.signCsrfNonce(nonce, context)}`;
  }

  public verifyCsrfToken(token: string, context: string): boolean {
    const parsed = token.match(csrfTokenPattern);
    const nonce = parsed?.[1];
    const suppliedSignature = parsed?.[2];

    if (!nonce || !suppliedSignature) {
      return false;
    }

    const expectedSignature = this.signCsrfNonce(nonce, context);
    return timingSafeEqual(
      Buffer.from(suppliedSignature, 'ascii'),
      Buffer.from(expectedSignature, 'ascii'),
    );
  }

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
    const sessionId = this.readRefreshSessionId(token);

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

  public async verifyAccessPrincipal(
    token: string,
    now = new Date(),
  ): Promise<AuthenticatedPrincipal | undefined> {
    const verified = await this.verifyAccessToken(token, now);
    const { role, sid, sub } = verified.payload;

    if (
      !sub ||
      !uuidPattern.test(sub) ||
      typeof sid !== 'string' ||
      !uuidPattern.test(sid) ||
      typeof role !== 'string' ||
      !authenticatedRoles.has(role)
    ) {
      return undefined;
    }

    return {
      role: role as AuthenticatedPrincipal['role'],
      sessionId: sid,
      userId: sub,
    };
  }

  public get secureCookies(): boolean {
    return this.config.secureCookies;
  }

  public get trustedWebOrigin(): string {
    return this.config.webOrigin;
  }

  public readRefreshSessionId(token: string | undefined): string | undefined {
    return token?.match(refreshTokenPattern)?.[1];
  }

  public hashRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private signCsrfNonce(nonce: string, context: string): string {
    return createHmac('sha256', this.csrfSigningKey)
      .update(`livepulse-csrf-v1\0${context}\0${nonce}`, 'utf8')
      .digest('base64url');
  }
}
