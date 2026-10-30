import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'vitest';

import { parseSamplerCsv } from '../../apps/api/scripts/benchmark-pipeline-analysis-core.mjs';

const directory = fileURLToPath(new URL('./raw/', import.meta.url));
const readJson = (name) =>
  JSON.parse(readFileSync(`${directory}${name}`, 'utf8'));

const expected = {
  'direct-a': { acked: 27_719, failedButPersisted: 1_232, drain: 0 },
  'direct-b': { acked: 27_711, failedButPersisted: 1_245, drain: 0 },
  'direct-c': { acked: 27_709, failedButPersisted: 1_223, drain: 0 },
  'kafka-a': { acked: 36_000, failedButPersisted: 0, drain: 27 },
  'kafka-b': { acked: 36_000, failedButPersisted: 0, drain: 31 },
  'kafka-c': { acked: 36_000, failedButPersisted: 0, drain: 60 },
};

for (const [run, values] of Object.entries(expected)) {
  test(`outage ${run}: summary matches raw generator and sampler data`, () => {
    const [mode] = run.split('-');
    const summary = readJson(`summary-outage-${run}.json`);
    const generator = readJson(`generator-a-outage-${run}.json`);
    const meta = readJson(`meta-outage-${run}.json`);
    const samples = parseSamplerCsv(
      readFileSync(`${directory}sampler-outage-${run}.csv`, 'utf8'),
    );
    const [result] = summary.generators;

    assert.equal(meta.mode, mode);
    assert.equal(generator.settings.messagePipeline, mode);
    assert.equal(generator.settings.connections, 200);
    assert.equal(generator.settings.messagesPerSecond, 200);
    assert.equal(generator.settings.durationSeconds, 180);
    assert.equal(generator.settings.plannedMessages, 36_000);
    assert.equal(generator.acceptedMessages, values.acked);
    assert.equal(generator.failures, 36_000 - values.acked);
    assert.equal(result.acked, values.acked);
    assert.equal(result.ackedNotPersisted, 0);
    assert.equal(result.failedButPersisted, values.failedButPersisted);
    assert.equal(result.persistedDuplicateRows, 0);
    assert.equal(summary.duplicateAuthorClientMessageIds, 0);
    assert.equal(summary.finalRows, result.persisted + 200);
    assert.equal(generator.deliveryVerification.duplicates, 0);
    assert.equal(generator.deliveryVerification.wrongRoomDeliveries, 0);
    // Every persisted message reached all 200 room members.
    assert.equal(
      generator.deliveryVerification.uniqueReceived,
      result.persisted * 200,
    );
    assert.ok(generator.dispatchLagMs.p99 <= 10);
    assert.ok(generator.dispatchLagMs.max <= 250);

    // The ShareLock was observed for about 40 s starting near t=60 s.
    assert.ok(summary.fault.startSecondInWindow >= 60);
    assert.ok(summary.fault.startSecondInWindow < 61);
    const lockSeconds =
      (summary.fault.lockSamples.firstClearMs -
        summary.fault.lockSamples.firstSeenMs) /
      1_000;
    // One-second sampling bounds the observed lock duration to 40 s +/- 1 s.
    assert.ok(lockSeconds >= 39 && lockSeconds <= 41);
    assert.ok(samples.some((sample) => sample.share_lock_held === 1));

    // Mode-neutral time to persisted: every stored message is estimated, and
    // the slowest ones were sent at the start of the outage.
    const delay = summary.persistenceDelay;
    assert.equal(delay.estimated, result.persisted);
    assert.ok(delay.maxSeconds >= 38 && delay.maxSeconds <= 43);
    assert.equal(delay.worstTenSecondFromSecond, 60);
    assert.ok(mode === 'kafka' ? delay.p95Seconds > 35 : delay.p95Seconds === 0);

    if (mode === 'kafka') {
      assert.deepEqual(generator.errorCounts, {});
      assert.equal(summary.sampler.persistenceDrainSeconds, values.drain);
      assert.ok(summary.sampler.peakPersistenceLag > 9_000);
    } else {
      assert.equal(generator.errorCounts.REALTIME_RATE_LIMITED, 2_199);
      assert.equal(summary.sampler.databaseQueueDrainSeconds, values.drain);
      assert.equal(summary.sampler.peakPgLockWaiters, 10);
      // All failures fall inside the outage and its recovery window.
      for (const window of generator.tenSecondWindows) {
        if (window.fromSecond < 60 || window.fromSecond >= 110) {
          assert.equal(window.failures, 0);
        }
      }
      const excluded =
        generator.acceptedMessages /
        (36_000 - generator.errorCounts.REALTIME_RATE_LIMITED);
      assert.ok(excluded > 0.8197 && excluded < 0.8202);
    }
  });
}
