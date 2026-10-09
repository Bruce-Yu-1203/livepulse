const developmentAccessTokenSecret =
  'livepulse-development-access-token-secret-change-me';

export const accessTokenLifetimeSeconds = 15 * 60;
export const refreshTokenLifetimeSeconds = 30 * 24 * 60 * 60;

interface AuthEnvironment {
  accessTokenSecret: string | undefined;
  nodeEnvironment: string | undefined;
}

export interface AuthConfig {
  accessTokenSecret: Uint8Array;
  secureCookies: boolean;
}

export function resolveAuthConfig(environment: AuthEnvironment): AuthConfig {
  const secret =
    environment.accessTokenSecret ??
    (environment.nodeEnvironment === 'production'
      ? undefined
      : developmentAccessTokenSecret);

  if (!secret) {
    throw new Error('ACCESS_TOKEN_SECRET is required in production');
  }

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('ACCESS_TOKEN_SECRET must contain at least 32 bytes');
  }

  return {
    accessTokenSecret: new TextEncoder().encode(secret),
    secureCookies: environment.nodeEnvironment === 'production',
  };
}
