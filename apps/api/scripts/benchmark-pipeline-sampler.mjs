import console from 'node:console';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
import { createDatabaseClient } from '@livepulse/db';
import { Kafka, logLevel } from 'kafkajs';

import {
  computeGroupLag,
  formatSampleRow,
  readSamplerConfig,
  samplerColumns,
  takeNewEvents,
} from './benchmark-pipeline-sampler-core.mjs';

// Samples persistence progress, database pressure, and Kafka consumer lag once
// per interval and writes CSV rows to stdout until SIGINT or SIGTERM.
const config = readSamplerConfig(process.env);
const database = createDatabaseClient(config.databaseUrl);
const admin = config.kafka
  ? new Kafka({
      brokers: config.kafka.brokers,
      clientId: 'livepulse-benchmark-sampler',
      logLevel: logLevel.NOTHING,
    }).admin()
  : null;
let running = true;
let consumedEventLines = 0;
process.once('SIGINT', () => (running = false));
process.once('SIGTERM', () => (running = false));

async function readDatabase() {
  const [row] = await database.$queryRawUnsafe(`
    SELECT
      (SELECT count(*) FROM danmaku_messages)::int AS rows,
      (SELECT count(*) FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND state = 'active')::int AS active,
      (SELECT count(*) FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid())::int AS total,
      (SELECT count(*) FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock')::int AS waiters,
      EXISTS (
        SELECT 1 FROM pg_locks
        WHERE relation = 'danmaku_messages'::regclass
          AND mode = 'ShareLock' AND granted
      ) AS share_lock
  `);
  return row;
}

async function readLag(groupId, topicOffsets) {
  const [topic] = await admin.fetchOffsets({
    groupId,
    topics: [config.kafka.topic],
  });
  return computeGroupLag(topicOffsets, topic?.partitions ?? []);
}

async function readEvents() {
  if (!config.eventsFile) return [];
  const content = await readFile(config.eventsFile, 'utf8').catch(() => '');
  const next = takeNewEvents(content, consumedEventLines);
  consumedEventLines = next.consumedLines;
  return next.events;
}

async function sample() {
  const epochMs = Date.now();
  const [db, lags, events] = await Promise.all([
    readDatabase(),
    admin
      ? admin
          .fetchTopicOffsets(config.kafka.topic)
          .then((offsets) =>
            Promise.all([
              readLag(config.kafka.persistenceGroup, offsets),
              readLag(config.kafka.broadcastGroup, offsets),
            ]),
          )
      : Promise.resolve([null, null]),
    readEvents(),
  ]);
  return {
    epoch_ms: epochMs,
    iso_time: new Date(epochMs).toISOString(),
    danmaku_rows: db.rows,
    pg_active: db.active,
    pg_total: db.total,
    pg_lock_waiters: db.waiters,
    share_lock_held: db.share_lock ? 1 : 0,
    persistence_lag: lags[0],
    broadcast_lag: lags[1],
    event: events.join('|'),
  };
}

try {
  if (admin) await admin.connect();
  console.log(samplerColumns.join(','));
  let nextAt = Date.now();
  while (running) {
    try {
      console.log(formatSampleRow(await sample()));
    } catch (error) {
      console.error(`Sampler error: ${error?.message ?? error}`);
    }
    nextAt += config.intervalMs;
    const waitMs = nextAt - Date.now();
    if (waitMs > 0) await setTimeout(waitMs);
    else nextAt = Date.now();
  }
} finally {
  await Promise.allSettled([database.$disconnect(), admin?.disconnect()]);
}
