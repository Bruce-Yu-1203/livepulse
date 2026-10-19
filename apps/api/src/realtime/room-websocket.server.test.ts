import { describe, expect, it } from 'vitest';

import {
  hasBetterAuthSessionCookie,
  heartbeatHasExpired,
  heartbeatIntervalMs,
  heartbeatTimeoutMs,
} from './room-websocket.server.js';

describe('room websocket heartbeat', () => {
  it('checks connections every fifteen seconds', () => {
    expect(heartbeatIntervalMs).toBe(15_000);
  });

  it('expires a connection after forty-five seconds without a pong', () => {
    expect(heartbeatHasExpired(10_000, 10_000 + heartbeatTimeoutMs - 1)).toBe(
      false,
    );
    expect(heartbeatHasExpired(10_000, 10_000 + heartbeatTimeoutMs)).toBe(true);
    expect(heartbeatHasExpired(10_000, 10_000 + heartbeatTimeoutMs + 1)).toBe(
      true,
    );
  });
});

describe('room websocket authentication cookie detection', () => {
  it('detects the regular Better Auth session cookie', () => {
    expect(
      hasBetterAuthSessionCookie('theme=dark; livepulse.session_token=token'),
    ).toBe(true);
  });

  it('detects the secure production Better Auth session cookie', () => {
    expect(
      hasBetterAuthSessionCookie(
        'theme=dark; __Secure-livepulse.session_token=token',
      ),
    ).toBe(true);
  });

  it('ignores unrelated and empty session cookies', () => {
    expect(hasBetterAuthSessionCookie('theme=dark')).toBe(false);
    expect(hasBetterAuthSessionCookie('livepulse.session_token=')).toBe(false);
    expect(hasBetterAuthSessionCookie(undefined)).toBe(false);
  });
});
