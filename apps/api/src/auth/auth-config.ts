const developmentAuthSecret =
  'livepulse-development-better-auth-secret-change-me';

export const sessionLifetimeSeconds = 30 * 24 * 60 * 60;
export const sessionUpdateAgeSeconds = 24 * 60 * 60;

interface AuthEnvironment {
  apiOrigin?: string | undefined;
  authSecret: string | undefined;
  cookieDomain?: string | undefined;
  googleClientId?: string | undefined;
  googleClientSecret?: string | undefined;
  nodeEnvironment: string | undefined;
  webOrigin?: string | undefined;
}

export interface AuthConfig {
  apiOrigin: string;
  authSecret: string;
  cookieDomain: string | undefined;
  google:
    | {
        clientId: string;
        clientSecret: string;
      }
    | undefined;
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

  const googleClientId = environment.googleClientId?.trim() || undefined;
  const googleClientSecret =
    environment.googleClientSecret?.trim() || undefined;

  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together',
    );
  }

  const cookieDomain = environment.cookieDomain?.trim() || undefined;
  if (cookieDomain && !isCookieDomain(cookieDomain)) {
    throw new Error('AUTH_COOKIE_DOMAIN must be a hostname without a scheme');
  }

  return {
    apiOrigin: apiUrl.origin,
    authSecret: secret,
    cookieDomain,
    google:
      googleClientId && googleClientSecret
        ? { clientId: googleClientId, clientSecret: googleClientSecret }
        : undefined,
    secureCookies: environment.nodeEnvironment === 'production',
    webOrigin: webUrl.origin,
  };
}

function isCookieDomain(value: string): boolean {
  const hostname = value.startsWith('.') ? value.slice(1) : value;
  return (
    hostname.length > 0 &&
    hostname.length <= 253 &&
    !hostname.includes('/') &&
    !hostname.includes(':') &&
    hostname
      .split('.')
      .every((label) => /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/iu.test(label))
  );
}
