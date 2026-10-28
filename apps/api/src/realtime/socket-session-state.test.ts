import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedSession } from '../auth/better-auth.service.js';
import { SocketSessionState } from './socket-session-state.js';

const principal = {
  role: 'VIEWER' as const,
  sessionId: 'session-1',
  userId: 'user-1',
};

describe('SocketSessionState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('uses the principal for fifteen seconds and shares one refresh', async () => {
    const state = new SocketSessionState(
      new Headers(),
      true,
      session(Date.now() + 60_000),
    );
    let complete!: (value: AuthenticatedSession) => void;
    const authentication = {
      sessionPrincipalFromHeaders: vi.fn().mockImplementation(
        () =>
          new Promise<AuthenticatedSession>((resolve) => {
            complete = resolve;
          }),
      ),
    };
    const refreshed = vi.fn();

    expect(await state.resolve(authentication, refreshed)).toEqual(principal);
    vi.advanceTimersByTime(15_000);
    const first = state.resolve(authentication, refreshed);
    const second = state.resolve(authentication, refreshed);
    expect(authentication.sessionPrincipalFromHeaders).toHaveBeenCalledOnce();
    expect(refreshed).toHaveBeenCalledOnce();
    complete(session(Date.now() + 60_000));
    expect(await Promise.all([first, second])).toEqual([principal, principal]);
  });

  it('never extends beyond the actual session expiration', async () => {
    const state = new SocketSessionState(
      new Headers(),
      true,
      session(Date.now() + 1_000),
    );
    const authentication = {
      sessionPrincipalFromHeaders: vi.fn().mockResolvedValue(undefined),
    };

    vi.advanceTimersByTime(999);
    expect(state.isCached()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(state.isCached()).toBe(false);
    expect(await state.resolve(authentication)).toBeUndefined();
    expect(state.principal).toBeUndefined();
  });

  it('clears stale identity when revalidation fails', async () => {
    const state = new SocketSessionState(
      new Headers(),
      true,
      session(Date.now() + 60_000),
    );
    state.invalidate();
    const authentication = {
      sessionPrincipalFromHeaders: vi
        .fn()
        .mockRejectedValue(new Error('db down')),
    };

    await expect(state.resolve(authentication)).rejects.toThrow('db down');
    expect(state.principal).toBeUndefined();
    expect(state.isCached()).toBe(false);
  });

  it('keeps a socket without a cookie anonymous', async () => {
    const state = new SocketSessionState(new Headers(), false, undefined);
    const authentication = {
      sessionPrincipalFromHeaders: vi.fn(),
    };

    expect(await state.resolve(authentication)).toBeUndefined();
    expect(authentication.sessionPrincipalFromHeaders).not.toHaveBeenCalled();
  });
});

function session(expiresAt: number): AuthenticatedSession {
  return { expiresAt: new Date(expiresAt), principal };
}
