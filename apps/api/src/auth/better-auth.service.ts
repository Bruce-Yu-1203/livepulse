import { Injectable } from '@nestjs/common';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';

import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedPrincipal } from './authenticated-request.js';
import {
  resolveAuthConfig,
  sessionLifetimeSeconds,
  sessionUpdateAgeSeconds,
} from './auth-config.js';
import { ScryptPasswordHasher } from './password-hasher.js';

export const betterAuthBasePath = '/api/v1/auth';
export const sessionCookieName = 'livepulse.session_token';
export const secureSessionCookieName = `__Secure-${sessionCookieName}`;

export type LivePulseAuth = ReturnType<typeof createLivePulseAuth>;
export type EnabledSocialProvider = 'google';

export interface AuthenticatedSession {
  principal: AuthenticatedPrincipal;
  expiresAt: Date;
}

@Injectable()
export class BetterAuthService {
  public readonly auth: LivePulseAuth;
  public readonly apiOrigin: string;
  public readonly enabledSocialProviders: readonly EnabledSocialProvider[];
  public readonly registrationSecret: string;
  public readonly trustedWebOrigin: string;

  public constructor(private readonly database: DatabaseService) {
    const config = resolveAuthConfig({
      apiOrigin: process.env.BETTER_AUTH_URL,
      authSecret: process.env.BETTER_AUTH_SECRET,
      cookieDomain: process.env.AUTH_COOKIE_DOMAIN,
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      nodeEnvironment: process.env.NODE_ENV,
      webOrigin: process.env.WEB_ORIGIN,
    });

    this.apiOrigin = config.apiOrigin;
    this.registrationSecret = config.authSecret;
    this.enabledSocialProviders = config.google ? ['google'] : [];
    this.trustedWebOrigin = config.webOrigin;
    this.auth = createLivePulseAuth(database.client, config);
  }

  public async principalFromHeaders(
    headers: Headers,
  ): Promise<AuthenticatedPrincipal | undefined> {
    return (await this.sessionPrincipalFromHeaders(headers))?.principal;
  }

  public async sessionPrincipalFromHeaders(
    headers: Headers,
  ): Promise<AuthenticatedSession | undefined> {
    const result = await this.auth.api.getSession({ headers });

    if (!result || !isRole(result.user.role)) {
      return undefined;
    }

    const expiresAt = new Date(result.session.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
      return undefined;
    }

    return {
      expiresAt,
      principal: {
        role: result.user.role,
        sessionId: result.session.id,
        userId: result.user.id,
      },
    };
  }

  public async sessionByToken(
    token: string,
  ): Promise<{ id: string; userId: string } | null> {
    return this.database.client.session.findUnique({
      select: { id: true, userId: true },
      where: { token },
    });
  }

  public async sessionExists(id: string): Promise<boolean> {
    return (
      (await this.database.client.session.findUnique({
        select: { id: true },
        where: { id },
      })) !== null
    );
  }
}

function createLivePulseAuth(
  database: DatabaseService['client'],
  config: ReturnType<typeof resolveAuthConfig>,
) {
  const passwordHasher = new ScryptPasswordHasher();
  const socialProviders = config.google
    ? {
        google: {
          clientId: config.google.clientId,
          clientSecret: config.google.clientSecret,
          prompt: 'select_account' as const,
          requireEmailVerification: true,
        },
      }
    : {};

  return betterAuth({
    account: {
      accountLinking: {
        enabled: true,
        requireLocalEmailVerified: false,
      },
      encryptOAuthTokens: true,
    },
    advanced: {
      cookiePrefix: 'livepulse',
      cookies: {
        oauth_state: { attributes: { sameSite: 'lax' } },
        state: { attributes: { sameSite: 'lax' } },
      },
      ...(config.cookieDomain
        ? {
            crossSubDomainCookies: {
              domain: config.cookieDomain,
              enabled: true,
            },
          }
        : {}),
      database: { generateId: 'uuid' },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.secureCookies,
      },
    },
    appName: 'LivePulse',
    basePath: betterAuthBasePath,
    baseURL: config.apiOrigin,
    database: prismaAdapter(database, {
      provider: 'postgresql',
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      maxPasswordLength: 128,
      minPasswordLength: 8,
      password: {
        hash: (password) => passwordHasher.hash(password),
        verify: ({ hash, password }) => passwordHasher.verify(password, hash),
      },
    },
    secret: config.authSecret,
    session: {
      expiresIn: sessionLifetimeSeconds,
      updateAge: sessionUpdateAgeSeconds,
    },
    socialProviders,
    trustedOrigins: [config.webOrigin],
    user: {
      additionalFields: {
        role: {
          defaultValue: 'VIEWER',
          input: false,
          required: true,
          type: 'string',
        },
      },
    },
  });
}

function isRole(value: unknown): value is AuthenticatedPrincipal['role'] {
  return value === 'ADMIN' || value === 'HOST' || value === 'VIEWER';
}
