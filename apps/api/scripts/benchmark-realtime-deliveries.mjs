import { clearTimeout, setTimeout } from 'node:timers';

export function createDeliveryVerifier(roomBySocket, messageCount) {
  const membersByRoom = new Map();
  for (const roomId of roomBySocket) {
    membersByRoom.set(roomId, (membersByRoom.get(roomId) ?? 0) + 1);
  }
  let expected = 0;
  for (let index = 0; index < messageCount; index += 1) {
    expected += membersByRoom.get(roomBySocket[index % roomBySocket.length]);
  }

  const bySocket = new Uint32Array(roomBySocket.length);
  let received = 0;
  let notifyComplete;
  const complete = new Promise((resolve) => {
    notifyComplete = resolve;
  });

  return {
    record(socketIndex, event) {
      if (!event?.payload?.text?.startsWith('Local benchmark message ')) {
        return;
      }
      bySocket[socketIndex] += 1;
      received += 1;
      if (received >= expected) notifyComplete();
    },
    async finish(timeoutMs = 15_000) {
      if (received < expected) {
        let timeout;
        await Promise.race([
          complete,
          new Promise((resolve) => {
            timeout = setTimeout(resolve, timeoutMs);
          }),
        ]);
        clearTimeout(timeout);
      }
      return {
        expected,
        received,
        complete: received === expected,
        minPerSocket: Math.min(...bySocket),
        maxPerSocket: Math.max(...bySocket),
      };
    },
  };
}
