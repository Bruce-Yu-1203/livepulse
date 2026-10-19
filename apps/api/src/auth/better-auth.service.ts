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

@Injectable()
export class BetterAuthService {
  public readonly auth: LivePulseAuth;
  public readonly apiOrigin: string;
  public readonly trustedWebOrigin: string;

  public constructor(database: DatabaseService) {
    const config = resolveAuthConfig({
      apiOrigin: process.env.BETTER_AUTH_URL,
      authSecret: process.env.BETTER_AUTH_SECRET,
      nodeEnvironment: process.env.NODE_ENV,
      webOrigin: process.env.WEB_ORIGIN,
    });

    this.apiOrigin = config.apiOrigin;
    this.trustedWebOrigin = config.webOrigin;
    this.auth = createLivePulseAuth(database.client, config);
  }

  public async principalFromHeaders(
    headers: Headers,
  ): Promise<AuthenticatedPrincipal | undefined> {
    const result = await this.auth.api.getSession({ headers });

    if (!result || !isRole(result.user.role)) {
      return undefined;
    }

    return {
      role: result.user.role,
      sessionId: result.session.id,
      userId: result.user.id,
    };
  }
}

function createLivePulseAuth(
  database: DatabaseService['client'],
  config: ReturnType<typeof resolveAuthConfig>,
) {
  const passwordHasher = new ScryptPasswordHasher();

  return betterAuth({
    advanced: {
      cookiePrefix: 'livepulse',
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
      maxPasswordLength: 128,
      minPasswordLength: 12,
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
