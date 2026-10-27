import { clearTimeout, setTimeout } from 'node:timers';
import { performance } from 'node:perf_hooks';

const measurementPrefix = 'Local benchmark message ';
const maxHistogramMilliseconds = 60_000;

export function createDeliveryVerifier(
  roomBySocket,
  messageCount,
  now = () => performance.now(),
) {
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
  const sentAtByMessage = new Float64Array(messageCount);
  sentAtByMessage.fill(-1);
  const deliveriesByMessage = new Uint32Array(messageCount);
  const recipientLatency = createLatencyHistogram();
  const fanout99Latency = createLatencyHistogram();
  const fanoutAllLatency = createLatencyHistogram();
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
    recordSent(messageIndex, sentAt) {
      sentAtByMessage[messageIndex] = sentAt;
    },
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
      const sentAt = sentAtByMessage[messageIndex];
      if (sentAt >= 0) {
        const latencyMs = Math.max(0, now() - sentAt);
        recipientLatency.record(latencyMs);
        const delivered = ++deliveriesByMessage[messageIndex];
        const roomSize = membersByRoom.get(messageRoomByIndex[messageIndex]);
        if (delivered === Math.ceil(roomSize * 0.99)) {
          fanout99Latency.record(latencyMs);
        }
        if (delivered === roomSize) fanoutAllLatency.record(latencyMs);
      }
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
        recipientLatencyMs: recipientLatency.summary(),
        fanout99LatencyMs: fanout99Latency.summary(),
        fanoutAllLatencyMs: fanoutAllLatency.summary(),
      };
    },
  };
}

function createLatencyHistogram() {
  const buckets = new Uint32Array(maxHistogramMilliseconds + 1);
  let count = 0;
  let withinOneSecond = 0;
  let max = 0;

  return {
    record(latencyMs) {
      count += 1;
      if (latencyMs <= 1_000) withinOneSecond += 1;
      max = Math.max(max, latencyMs);
      buckets[Math.min(maxHistogramMilliseconds, Math.floor(latencyMs))] += 1;
    },
    summary() {
      return {
        count,
        p50: percentile(buckets, count, 0.5),
        p95: percentile(buckets, count, 0.95),
        p99: percentile(buckets, count, 0.99),
        max: count ? Number(max.toFixed(2)) : null,
        withinOneSecond,
      };
    },
  };
}

function percentile(buckets, count, fraction) {
  if (count === 0) return null;
  const target = Math.ceil(count * fraction);
  let seen = 0;
  for (let index = 0; index < buckets.length; index += 1) {
    seen += buckets[index];
    if (seen >= target) return index;
  }
  return maxHistogramMilliseconds;
}
