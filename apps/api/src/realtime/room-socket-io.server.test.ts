import { describe, expect, it } from 'vitest';

import {
  hasBetterAuthSessionCookie,
  heartbeatIntervalMs,
  heartbeatTimeoutMs,
  socketIoPath,
} from './room-socket-io.server.js';

describe('room Socket.IO transport', () => {
  it('configures a bounded packet and heartbeat transport', () => {
    expect(socketIoPath).toBe('/socket.io');
    expect(heartbeatIntervalMs).toBe(15_000);
    expect(heartbeatTimeoutMs).toBe(45_000);
  });

  it('detects both Better Auth cookie names', () => {
    expect(hasBetterAuthSessionCookie('livepulse.session_token=token')).toBe(
      true,
    );
    expect(
      hasBetterAuthSessionCookie('__Secure-livepulse.session_token=token'),
    ).toBe(true);
    expect(hasBetterAuthSessionCookie('theme=dark')).toBe(false);
    expect(hasBetterAuthSessionCookie('livepulse.session_token=')).toBe(false);
  });
});
