import { describe, expect, it, vi } from 'vitest';

import { installNativeRoomBroadcast } from './benchmark-realtime-native-broadcast.mjs';

function fixture() {
  const peer = { id: 'peer-1' };
  const socket = { join: vi.fn(), leave: vi.fn() };
  const emit = vi.fn();
  const io = {
    sockets: { sockets: new Map([[peer.id, socket]]) },
    to: vi.fn(() => ({ emit })),
  };
  const originalBroadcast = vi.fn();
  const hub = {
    joinedRoomByPeer: new Map(),
    roomMembers: new Map(),
    metrics: { deliveriesAttempted: vi.fn() },
    async join(joiningPeer, _requestId, roomId) {
      if (roomId !== 'blocked') {
        this.joinedRoomByPeer.set(joiningPeer.id, roomId);
        this.roomMembers.set(roomId, new Set([joiningPeer]));
      }
    },
    async removeFromRoom(leavingPeer, roomId) {
      this.joinedRoomByPeer.delete(leavingPeer.id);
      this.roomMembers.delete(roomId);
    },
    broadcastLocal: originalBroadcast,
  };
  installNativeRoomBroadcast(hub, io);
  return { emit, hub, io, originalBroadcast, peer, socket };
}

describe('benchmark native room broadcast', () => {
  it('joins only after a successful application room join and leaves on removal', async () => {
    const { hub, peer, socket } = fixture();
    await hub.join(peer, 'request-1', 'blocked');
    expect(socket.join).not.toHaveBeenCalled();

    await hub.join(peer, 'request-2', 'room-1');
    expect(socket.join).toHaveBeenCalledWith('room-1');
    await hub.removeFromRoom(peer, 'room-1');
    expect(socket.leave).toHaveBeenCalledWith('room-1');
  });

  it('broadcasts message events through Socket.IO and retains other events', async () => {
    const { emit, hub, io, originalBroadcast, peer } = fixture();
    await hub.join(peer, 'request-1', 'room-1');
    const message = { type: 'message.created', payload: { roomId: 'room-1' } };
    hub.broadcastLocal(message);
    expect(hub.metrics.deliveriesAttempted).toHaveBeenCalledWith(1);
    expect(io.to).toHaveBeenCalledWith('room-1');
    expect(emit).toHaveBeenCalledWith('message.created', message);

    const stats = { type: 'room.stats', payload: { roomId: 'room-1' } };
    hub.broadcastLocal(stats);
    expect(originalBroadcast).toHaveBeenCalledWith(stats);
  });
});
