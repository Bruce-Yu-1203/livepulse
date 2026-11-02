import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'vitest';

const directory = fileURLToPath(new URL('./', import.meta.url));

const expectedVerdicts = {
  before: {
    '250a': 'pass',
    '275a': 'pass',
    '300a': 'pass',
    '300b': 'pass',
    '300c': 'pass',
    '325a': 'pass',
    '325b': 'pass',
    '325c': 'pass',
    '350a': 'pass',
    '400a': 'pass',
    '400b': 'pass',
    '400c': 'pass',
    '450a': 'invalid-schedule',
  },
  after: {
    '325a': 'pass',
    '400a': 'pass',
    '400b': 'pass',
    '400c': 'pass',
    '450a': 'pass',
    '500a': 'pass',
    '500b': 'pass',
    '500c': 'pass',
    '600a': 'invalid-schedule',
  },
};

function readJson(side, name) {
  return JSON.parse(readFileSync(`${directory}${side}/${name}`, 'utf8'));
}

function apiCores(api) {
  const { cpuSystemMs, cpuUserMs } = api.apiProcess;
  return (cpuUserMs + cpuSystemMs) / 1_000 / api.durationSeconds;
}

// Same validity and SLO rules as the 2026-10-27 and 2026-10-28 reports.
function verdict(generator) {
  const { dispatchLagMs: dispatch, endToEndAckMs: ack } = generator;
  const delivery = generator.deliveryVerification;
  if (dispatch.p99 > 10 || dispatch.max > 250) return 'invalid-schedule';

  const worstWindow = Math.max(
    ...generator.tenSecondWindows.map((window) => window.endToEndAckMs.p95),
  );
  const passed =
    generator.failures === 0 &&
    generator.acceptedDuringWindow / generator.sentDuringWindow >= 0.999 &&
    ack.p95 <= 100 &&
    ack.p99 <= 500 &&
    worstWindow <= 200 &&
    delivery.recipientLatencyMs.p95 <= 250 &&
    delivery.recipientLatencyMs.p99 <= 1_000 &&
    delivery.recipientLatencyMs.withinOneSecond / delivery.expected >=
      0.9999 &&
    delivery.missing === 0 &&
    delivery.duplicates === 0 &&
    delivery.wrongRoomDeliveries === 0 &&
    delivery.invalidMessageIndexes === 0;
  return passed ? 'pass' : 'fail-slo';
}

for (const [side, runs] of Object.entries(expectedVerdicts)) {
  for (const [run, expectedVerdict] of Object.entries(runs)) {
    test(`${side} ${run}: benchmark data and verdict`, () => {
      const generator = readJson(side, `generator-${run}.json`);
      const api = readJson(side, `api-${run}.json`);
      const rate = Number(run.slice(0, 3));

      assert.equal(generator.settings.messagesPerSecond, rate);
      assert.equal(generator.settings.connections, rate);
      assert.equal(generator.settings.durationSeconds, 300);
      assert.equal(generator.settings.roomIds.length, 1);
      assert.equal(generator.tenSecondWindows.length, 30);
      assert.equal(api.broadcastBatchMs ?? 0, side === 'after' ? 50 : 0);
      assert.equal(verdict(generator), expectedVerdict);
    });
  }
}

test('each side has three valid passes at its highest confirmed rate', () => {
  for (const [side, runs] of [
    ['before', ['400a', '400b', '400c']],
    ['after', ['500a', '500b', '500c']],
  ]) {
    assert.deepEqual(
      runs.map((run) => verdict(readJson(side, `generator-${run}.json`))),
      ['pass', 'pass', 'pass'],
    );
  }
});

test('batching cuts API CPU at 400 messages/s by more than 70%', () => {
  const runs = ['400a', '400b', '400c'];
  const mean = (side) =>
    runs
      .map((run) => apiCores(readJson(side, `api-${run}.json`)))
      .reduce((sum, value) => sum + value, 0) / runs.length;

  const reduction = 1 - mean('after') / mean('before');
  assert.ok(reduction > 0.7, `reduction was ${reduction}`);
});

test('batched runs write about 20 frames per socket per second', () => {
  for (const run of Object.keys(expectedVerdicts.after)) {
    const frames = readJson('after', `generator-${run}.json`).messageFrames;
    assert.ok(frames.perSocketPerSecond > 19 && frames.perSocketPerSecond < 21);
  }
});
