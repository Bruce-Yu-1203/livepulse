import { URL } from 'node:url';

const localHosts = new Set(['127.0.0.1', 'localhost']);

export const samplerColumns = [
  'epoch_ms',
  'iso_time',
  'danmaku_rows',
  'pg_active',
  'pg_total',
  'pg_lock_waiters',
  'share_lock_held',
  'persistence_lag',
  'broadcast_lag',
  'event',
];

export function readSamplerConfig(environment) {
  const databaseUrl = environment.DATABASE_URL;
  if (
    !databaseUrl ||
    !localUrl(databaseUrl, ['postgres:', 'postgresql:']) ||
    !new URL(databaseUrl).pathname.startsWith('/livepulse_benchmark_')
  ) {
    throw new Error(
      'DATABASE_URL must point to a local livepulse_benchmark_* database',
    );
  }
  const intervalMs = Number(environment.BENCHMARK_SAMPLER_INTERVAL_MS ?? 1000);
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 100) {
    throw new Error('BENCHMARK_SAMPLER_INTERVAL_MS must be at least 100');
  }
  const brokers = environment.KAFKA_BROKERS
    ? environment.KAFKA_BROKERS.split(',')
        .map((broker) => broker.trim())
        .filter(Boolean)
    : [];
  if (brokers.some((broker) => !localHosts.has(broker.split(':')[0]))) {
    throw new Error('KAFKA_BROKERS must be local for the benchmark sampler');
  }
  const kafka = brokers.length
    ? {
        brokers,
        topic: required(environment, 'KAFKA_MESSAGES_TOPIC'),
        broadcastGroup: required(environment, 'KAFKA_BROADCAST_GROUP'),
        persistenceGroup: required(environment, 'KAFKA_PERSISTENCE_GROUP'),
      }
    : null;
  return {
    databaseUrl,
    intervalMs,
    kafka,
    eventsFile: environment.BENCHMARK_SAMPLER_EVENTS_FILE || null,
  };
}

/**
 * Sum consumer-group lag across partitions. A partition without a committed
 * offset counts from the low watermark because the workers subscribe from the
 * beginning of the topic.
 */
export function computeGroupLag(topicOffsets, groupPartitions) {
  const committed = new Map(
    groupPartitions.map((entry) => [entry.partition, Number(entry.offset)]),
  );
  let lag = 0;
  for (const partition of topicOffsets) {
    const high = Number(partition.high ?? partition.offset);
    const low = Number(partition.low ?? 0);
    const offset = committed.get(partition.partition);
    const position = offset !== undefined && offset >= 0 ? offset : low;
    lag += Math.max(0, high - position);
  }
  return lag;
}

/** Return the event labels appended to the marker file since the last read. */
export function takeNewEvents(content, consumedLines) {
  const lines = content.split('\n').filter((line) => line.trim() !== '');
  return {
    events: lines.slice(consumedLines).map((line) => line.trim()),
    consumedLines: Math.max(consumedLines, lines.length),
  };
}

export function formatSampleRow(sample) {
  return samplerColumns
    .map((column) => {
      const value = sample[column];
      if (value === null || value === undefined) return '';
      const text = String(value);
      return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(',');
}

function required(environment, name) {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required when KAFKA_BROKERS is set`);
  return value;
}

function localUrl(value, protocols) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && localHosts.has(url.hostname);
  } catch {
    return false;
  }
}
