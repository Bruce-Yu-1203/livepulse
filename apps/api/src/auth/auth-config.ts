const developmentAuthSecret =
  'livepulse-development-better-auth-secret-change-me';

export const sessionLifetimeSeconds = 30 * 24 * 60 * 60;
export const sessionUpdateAgeSeconds = 24 * 60 * 60;

interface AuthEnvironment {
  apiOrigin?: string | undefined;
  authSecret: string | undefined;
  nodeEnvironment: string | undefined;
  webOrigin?: string | undefined;
}

export interface AuthConfig {
  apiOrigin: string;
  authSecret: string;
  secureCookies: boolean;
  webOrigin: string;
}

export function resolveAuthConfig(environment: AuthEnvironment): AuthConfig {
  const secret =
    environment.authSecret ??
    (environment.nodeEnvironment === 'production'
      ? undefined
      : developmentAuthSecret);

  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required in production');
  }

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 bytes');
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

  const configuredApiOrigin =
    environment.apiOrigin ??
    (environment.nodeEnvironment === 'production'
      ? undefined
      : 'http://localhost:3001');

  if (!configuredApiOrigin) {
    throw new Error('BETTER_AUTH_URL is required in production');
  }

  const apiUrl = new URL(configuredApiOrigin);
  if (!['http:', 'https:'].includes(apiUrl.protocol)) {
    throw new Error('BETTER_AUTH_URL must use HTTP or HTTPS');
  }

  return {
    apiOrigin: apiUrl.origin,
    authSecret: secret,
    secureCookies: environment.nodeEnvironment === 'production',
    webOrigin: webUrl.origin,
  };
}
