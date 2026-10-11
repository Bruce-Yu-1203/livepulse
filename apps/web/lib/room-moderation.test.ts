import { describe, expect, it } from 'vitest';

import { canModerateRoom } from './room-moderation';

describe('room moderation helpers', () => {
  it('allows the room host and administrators to moderate a live room', () => {
    expect(canModerateRoom('HOST', 'host-1', 'host-1', 'LIVE')).toBe(true);
    expect(canModerateRoom('ADMIN', 'admin-1', 'host-1', 'LIVE')).toBe(true);
  });

  it('hides moderation from viewers, other hosts, and ended rooms', () => {
    expect(canModerateRoom('VIEWER', 'viewer-1', 'host-1', 'LIVE')).toBe(false);
    expect(canModerateRoom('HOST', 'host-2', 'host-1', 'LIVE')).toBe(false);
    expect(canModerateRoom('HOST', 'host-1', 'host-1', 'ENDED')).toBe(false);
    expect(canModerateRoom(undefined, undefined, 'host-1', 'LIVE')).toBe(false);
  });
});
