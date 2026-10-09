import { describe, expect, it } from 'vitest';

import { AuthTokenService } from './auth-token.service.js';

const user = {
  createdAt: new Date('2026-10-09T01:00:00.000Z'),
  email: 'viewer@example.com',
  id: '295d5bd9-d9da-44b2-8f5d-8839f13a4437',
  role: 'VIEWER' as const,
};

describe('AuthTokenService', () => {
  const tokens = new AuthTokenService();

  it('signs a short-lived access token with user and session claims', async () => {
    const credentials = await tokens.createAccessCredentials(
      user,
      '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
      new Date('2026-10-09T01:00:00.000Z'),
    );
    const verified = await tokens.verifyAccessToken(
      credentials.token,
      new Date('2026-10-09T01:01:00.000Z'),
    );

    expect(verified.payload.sub).toBe(user.id);
    expect(verified.payload.sid).toBe('99d30467-ed47-43b8-96b0-d36ab2ee60e0');
    expect(verified.payload.role).toBe('VIEWER');
    expect(credentials.expiresAt.toISOString()).toBe(
      '2026-10-09T01:15:00.000Z',
    );
  });

  it('creates an opaque refresh token and stores only a fixed-size hash', () => {
    const credentials = tokens.createRefreshCredentials(
      new Date('2026-10-09T01:00:00.000Z'),
      '99d30467-ed47-43b8-96b0-d36ab2ee60e0',
    );

    expect(credentials.token).toMatch(
      /^99d30467-ed47-43b8-96b0-d36ab2ee60e0\.[A-Za-z0-9_-]{43}$/,
    );
    expect(credentials.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(credentials.tokenHash).not.toContain(credentials.token);
  });

  it('prepares rotation only for well-formed refresh credentials', () => {
    const original = tokens.createRefreshCredentials();
    const rotation = tokens.prepareRefreshRotation(original.token);

    expect(rotation?.sessionId).toBe(original.sessionId);
    expect(rotation?.currentTokenHash).toBe(original.tokenHash);
    expect(rotation?.next.token).not.toBe(original.token);
    expect(tokens.prepareRefreshRotation('malformed')).toBeUndefined();
  });
});
