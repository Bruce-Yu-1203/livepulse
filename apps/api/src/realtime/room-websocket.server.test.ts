import { describe, expect, it } from 'vitest';

import {
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
