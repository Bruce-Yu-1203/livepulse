import { describe, expect, it, vi } from 'vitest';

import { RoomLifecycleEvents } from './room-lifecycle.events.js';

describe('RoomLifecycleEvents', () => {
  it('notifies active listeners and supports unsubscription', async () => {
    const events = new RoomLifecycleEvents();
    const listener = vi.fn().mockResolvedValue(undefined);
    const unsubscribe = events.subscribeToRoomEnded(listener);
    const notification = {
      endedAt: new Date('2026-10-16T20:00:00.000Z'),
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };

    await events.publishRoomEnded(notification);
    expect(listener).toHaveBeenCalledWith(notification);

    unsubscribe();
    await events.publishRoomEnded(notification);
    expect(listener).toHaveBeenCalledOnce();
  });
});
