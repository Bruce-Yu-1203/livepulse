import console from 'node:console';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { createDatabaseClient } from '@livepulse/db';

import {
  eventTime,
  lockWindow,
  parseSamplerCsv,
  summarizeGenerator,
  summarizeSamples,
} from './benchmark-pipeline-analysis-core.mjs';
import { estimatePersistenceDelays } from './benchmark-pipeline-persistence-delay.mjs';
import { readSamplerConfig } from './benchmark-pipeline-sampler-core.mjs';

// Usage: node benchmark-pipeline-analysis.mjs SAMPLER_CSV GENERATOR_JSON...
// Prints one JSON summary that joins generator, sampler, and database results.
const [samplerPath, ...generatorPaths] = process.argv.slice(2);
if (!samplerPath || generatorPaths.length === 0) {
  throw new Error('Pass a sampler CSV and at least one generator JSON file');
}
const { databaseUrl } = readSamplerConfig(process.env);
const samples = parseSamplerCsv(await readFile(samplerPath, 'utf8'));
const generators = await Promise.all(
  generatorPaths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))),
);
const database = createDatabaseClient(databaseUrl);

try {
  const [{ rows: finalRows }] = await database.$queryRawUnsafe(
    'SELECT count(*)::int AS rows FROM danmaku_messages',
  );
  const [{ duplicates: duplicateIds }] = await database.$queryRawUnsafe(`
    SELECT count(*)::int AS duplicates FROM (
      SELECT author_id, client_message_id FROM danmaku_messages
      GROUP BY 1, 2 HAVING count(*) > 1
    ) AS duplicated
  `);
  const summaries = [];
  const persistedIndexes = [];
  for (const generator of generators) {
    const prefix = generator.settings.measurementPrefix;
    const rows = await database.$queryRawUnsafe(
      'SELECT text FROM danmaku_messages WHERE starts_with(text, $1)',
      prefix,
    );
    const indexes = new Set(
      rows.map((row) => Number(row.text.slice(prefix.length))),
    );
    persistedIndexes.push(indexes);
    summaries.push(
      summarizeGenerator(generator, {
        indexes,
        duplicateRows: rows.length - indexes.size,
      }),
    );
  }

  const lock = lockWindow(samples);
  const faultStartMs =
    eventTime(samples, 'fault_start') ?? eventTime(samples, 'burst_start');
  const faultEndMs =
    lock?.firstClearMs ??
    eventTime(samples, 'fault_end') ??
    eventTime(samples, 'burst_end');
  const anchor = generators[0].windowStartedAtEpochMs;
  console.log(
    JSON.stringify(
      {
        finalRows,
        duplicateAuthorClientMessageIds: duplicateIds,
        fault: {
          startMs: faultStartMs,
          endMs: faultEndMs,
          startSecondInWindow:
            faultStartMs &&
            Number(((faultStartMs - anchor) / 1_000).toFixed(1)),
          endSecondInWindow:
            faultEndMs && Number(((faultEndMs - anchor) / 1_000).toFixed(1)),
          lockSamples: lock,
        },
        generators: summaries,
        // Mode-neutral time from send until the row appears in PostgreSQL.
        persistenceDelay: estimatePersistenceDelays({
          samples,
          generators: generators.map((generator, index) => ({
            windowStartedAtEpochMs: generator.windowStartedAtEpochMs,
            messagesPerSecond: generator.settings.messagesPerSecond,
            persistedIndexes: [...persistedIndexes[index]],
          })),
          warmupRows: generators.slice(1).map((generator) => ({
            afterEpochMs: generator.windowStartedAtEpochMs,
            rows: generator.settings.connections,
          })),
        }),
        sampler: summarizeSamples(samples, {
          faultStartMs: faultStartMs ?? anchor,
          faultEndMs: faultEndMs ?? anchor,
        }),
      },
      null,
      2,
    ),
  );
} finally {
  await database.$disconnect();
}
