import { samplerColumns } from './benchmark-pipeline-sampler-core.mjs';

const numericColumns = new Set([
  'epoch_ms',
  'danmaku_rows',
  'pg_active',
  'pg_total',
  'pg_lock_waiters',
  'share_lock_held',
  'persistence_lag',
  'broadcast_lag',
]);

export function parseSamplerCsv(content) {
  const [header, ...lines] = content.split('\n').filter((line) => line !== '');
  const columns = header.split(',');
  if (columns.join(',') !== samplerColumns.join(',')) {
    throw new Error('Unexpected sampler CSV header');
  }
  return lines.map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(
      columns.map((column, index) => {
        const value = values[index] ?? '';
        if (!numericColumns.has(column)) return [column, value];
        return [column, value === '' ? null : Number(value)];
      }),
    );
  });
}

/** Find the first sample carrying an orchestrator event label. */
export function eventTime(samples, label) {
  return (
    samples.find((sample) => sample.event.split('|').includes(label))
      ?.epoch_ms ?? null
  );
}

/**
 * Locate the lock window from the sampler's ShareLock flag, falling back to
 * orchestrator markers when the lock was shorter than one sample.
 */
export function lockWindow(samples) {
  const held = samples.filter((sample) => sample.share_lock_held === 1);
  if (held.length === 0) return null;
  const last = held.at(-1);
  const after = samples.find((sample) => sample.epoch_ms > last.epoch_ms);
  return {
    firstSeenMs: held[0].epoch_ms,
    lastSeenMs: last.epoch_ms,
    firstClearMs: after?.epoch_ms ?? null,
  };
}

export function summarizeSamples(samples, { faultEndMs, finalRows }) {
  const max = (column) =>
    samples.reduce(
      (peak, sample) =>
        sample[column] === null ? peak : Math.max(peak ?? 0, sample[column]),
      null,
    );
  const afterFault = samples.filter((sample) => sample.epoch_ms >= faultEndMs);
  const firstAfter = (predicate) => {
    const sample = afterFault.find(predicate);
    return sample
      ? Number(((sample.epoch_ms - faultEndMs) / 1_000).toFixed(1))
      : null;
  };
  const kafka = samples.some((sample) => sample.persistence_lag !== null);
  return {
    samples: samples.length,
    peakPersistenceLag: max('persistence_lag'),
    peakBroadcastLag: max('broadcast_lag'),
    peakPgActive: max('pg_active'),
    peakPgTotal: max('pg_total'),
    peakPgLockWaiters: max('pg_lock_waiters'),
    persistenceLagZeroAfterFaultSeconds: kafka
      ? firstAfter((sample) => sample.persistence_lag === 0)
      : null,
    rowsFinalAfterFaultSeconds: firstAfter(
      (sample) => sample.danmaku_rows >= finalRows,
    ),
  };
}

export function worstWindowAckP95(generator) {
  let worst = null;
  let windowsWithoutAck = 0;
  for (const window of generator.tenSecondWindows) {
    const p95 = window.endToEndAckMs.p95;
    if (p95 === null) {
      if (window.sentMessages > 0) windowsWithoutAck += 1;
      continue;
    }
    worst = Math.max(worst ?? 0, p95);
  }
  return { worst, windowsWithoutAck };
}

/**
 * Compare a generator's ACK outcomes with the message indexes that reached
 * PostgreSQL. Acknowledged-but-missing rows are losses; failed-but-persisted
 * rows are messages the sender was told failed but were stored anyway.
 */
export function summarizeGenerator(generator, persisted) {
  const planned = generator.settings.plannedMessages;
  const failed = new Set(generator.failedMessageIndexes);
  let ackedNotPersisted = 0;
  let failedButPersisted = 0;
  for (let index = 0; index < planned; index += 1) {
    const stored = persisted.indexes.has(index);
    if (failed.has(index)) {
      if (stored) failedButPersisted += 1;
    } else if (!stored) {
      ackedNotPersisted += 1;
    }
  }
  const delivery = generator.deliveryVerification ?? null;
  const worst = worstWindowAckP95(generator);
  return {
    pipeline: generator.settings.messagePipeline,
    connections: generator.settings.connections,
    messagesPerSecond: generator.settings.messagesPerSecond,
    durationSeconds: generator.settings.durationSeconds,
    windowStartedAtEpochMs: generator.windowStartedAtEpochMs,
    planned,
    acked: generator.acceptedMessages,
    sendSuccessPercent: Number(
      ((generator.acceptedMessages / planned) * 100).toFixed(3),
    ),
    failures: generator.failures,
    errorCounts: generator.errorCounts,
    ackMs: generator.endToEndAckMs,
    worstTenSecondAckP95Ms: worst.worst,
    tenSecondWindowsWithoutAck: worst.windowsWithoutAck,
    dispatchLagMs: generator.dispatchLagMs,
    delivery: delivery && {
      expected: delivery.expected,
      uniqueReceived: delivery.uniqueReceived,
      missing: delivery.missing,
      duplicates: delivery.duplicates,
      wrongRoomDeliveries: delivery.wrongRoomDeliveries,
      deliveredPercent: Number(
        ((delivery.uniqueReceived / delivery.expected) * 100).toFixed(3),
      ),
      recipientMs: delivery.recipientLatencyMs,
    },
    persisted: persisted.indexes.size,
    persistedDuplicateRows: persisted.duplicateRows,
    ackedNotPersisted,
    failedButPersisted,
  };
}

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        current += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      values.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  values.push(current);
  return values;
}
