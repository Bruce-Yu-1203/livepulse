export function installNativeRoomBroadcast(hub, io) {
  const join = hub.join.bind(hub);
  const removeFromRoom = hub.removeFromRoom.bind(hub);
  const broadcastLocal = hub.broadcastLocal.bind(hub);

  hub.join = async (peer, requestId, roomId) => {
    await join(peer, requestId, roomId);
    if (hub.joinedRoomByPeer.get(peer.id) === roomId) {
      await io.sockets.sockets.get(peer.id)?.join(roomId);
    }
  };

  hub.removeFromRoom = async (peer, roomId) => {
    await io.sockets.sockets.get(peer.id)?.leave(roomId);
    await removeFromRoom(peer, roomId);
  };

  hub.broadcastLocal = (event) => {
    if (event.type !== 'message.created') {
      broadcastLocal(event);
      return;
    }

    const roomId = event.payload.roomId;
    hub.metrics.deliveriesAttempted(hub.roomMembers.get(roomId)?.size ?? 0);
    io.to(roomId).emit(event.type, event);
  };
}
