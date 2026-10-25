import { clearTimeout, setTimeout } from 'node:timers';

const measurementPrefix = 'Local benchmark message ';

export function createDeliveryVerifier(roomBySocket, messageCount) {
  const membersByRoom = new Map();
  for (const roomId of roomBySocket) {
    membersByRoom.set(roomId, (membersByRoom.get(roomId) ?? 0) + 1);
  }
  let expected = 0;
  const messageRoomByIndex = [];
  for (let index = 0; index < messageCount; index += 1) {
    const roomId = roomBySocket[index % roomBySocket.length];
    messageRoomByIndex.push(roomId);
    expected += membersByRoom.get(roomId);
  }

  const bySocket = new Uint32Array(roomBySocket.length);
  const uniqueBySocket = new Uint32Array(roomBySocket.length);
  const seenBySocket = Array.from(
    { length: roomBySocket.length },
    () => new Uint8Array(Math.ceil(messageCount / 8)),
  );
  let received = 0;
  let uniqueReceived = 0;
  let duplicates = 0;
  let wrongRoomDeliveries = 0;
  let invalidMessageIndexes = 0;
  let notifyComplete;
  const complete = new Promise((resolve) => {
    notifyComplete = resolve;
  });

  return {
    record(socketIndex, event) {
      const text = event?.payload?.text;
      if (!text?.startsWith(measurementPrefix)) {
        return;
      }
      bySocket[socketIndex] += 1;
      received += 1;
      const messageIndex = Number(text.slice(measurementPrefix.length));
      if (
        !Number.isSafeInteger(messageIndex) ||
        messageIndex < 0 ||
        messageIndex >= messageCount
      ) {
        invalidMessageIndexes += 1;
        return;
      }
      if (roomBySocket[socketIndex] !== messageRoomByIndex[messageIndex]) {
        wrongRoomDeliveries += 1;
        return;
      }
      const seen = seenBySocket[socketIndex];
      const byteIndex = messageIndex >> 3;
      const mask = 1 << (messageIndex & 7);
      if (seen[byteIndex] & mask) {
        duplicates += 1;
        return;
      }
      seen[byteIndex] |= mask;
      uniqueBySocket[socketIndex] += 1;
      uniqueReceived += 1;
      if (uniqueReceived >= expected) notifyComplete();
    },
    async finish(timeoutMs = 15_000) {
      if (uniqueReceived < expected) {
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
        uniqueReceived,
        missing: expected - uniqueReceived,
        duplicates,
        wrongRoomDeliveries,
        invalidMessageIndexes,
        complete:
          uniqueReceived === expected &&
          received === expected &&
          duplicates === 0 &&
          wrongRoomDeliveries === 0 &&
          invalidMessageIndexes === 0,
        minPerSocket: Math.min(...bySocket),
        maxPerSocket: Math.max(...bySocket),
        minUniquePerSocket: Math.min(...uniqueBySocket),
        maxUniquePerSocket: Math.max(...uniqueBySocket),
      };
    },
  };
}
