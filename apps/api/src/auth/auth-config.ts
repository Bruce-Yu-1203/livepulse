const developmentAccessTokenSecret =
  'livepulse-development-access-token-secret-change-me';

export const accessTokenLifetimeSeconds = 15 * 60;
export const refreshTokenLifetimeSeconds = 30 * 24 * 60 * 60;

interface AuthEnvironment {
  accessTokenSecret: string | undefined;
  nodeEnvironment: string | undefined;
  webOrigin?: string | undefined;
}

export interface AuthConfig {
  accessTokenSecret: Uint8Array;
  secureCookies: boolean;
  webOrigin: string;
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

  const configuredWebOrigin =
    environment.webOrigin ??
    (environment.nodeEnvironment === 'production'
      ? undefined
      : 'http://localhost:3000');

  if (!configuredWebOrigin) {
    throw new Error('WEB_ORIGIN is required in production');
  }

  const webUrl = new URL(configuredWebOrigin);
  if (!['http:', 'https:'].includes(webUrl.protocol)) {
    throw new Error('WEB_ORIGIN must use HTTP or HTTPS');
  }

  return {
    accessTokenSecret: new TextEncoder().encode(secret),
    secureCookies: environment.nodeEnvironment === 'production',
    webOrigin: webUrl.origin,
  };
}
