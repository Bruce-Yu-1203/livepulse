import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'vitest';

const directory = fileURLToPath(new URL('./mst/', import.meta.url));
const expectedVerdicts = {
  '200a': 'pass',
  '250a': 'pass',
  '275a': 'pass',
  '275b': 'pass',
  '275c': 'invalid-schedule',
  '275d': 'pass',
  '300a': 'pass',
  '300b': 'fail-slo',
  '325a': 'fail-slo',
};

function readJson(name) {
  return JSON.parse(readFileSync(`${directory}${name}`, 'utf8'));
}

function verdict(generator) {
  const { dispatchLagMs: dispatch, endToEndAckMs: ack } = generator;
  const delivery = generator.deliveryVerification;
  if (dispatch.p99 > 10 || dispatch.max > 250) return 'invalid-schedule';

  const worstWindow = Math.max(
    ...generator.tenSecondWindows.map((window) => window.endToEndAckMs.p95),
  );
  const passed =
    generator.failures === 0 &&
    generator.acceptedMessages === generator.sentDuringWindow &&
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

for (const [run, expectedVerdict] of Object.entries(expectedVerdicts)) {
  test(`${run}: benchmark data and verdict`, () => {
    const generator = readJson(`generator-${run}.json`);
    const api = readJson(`api-${run}.json`);
    const rows = Number(readFileSync(`${directory}rows-${run}.txt`, 'utf8'));
    const planned = generator.settings.messagesPerSecond * 300;

    assert.equal(generator.settings.durationSeconds, 300);
    assert.equal(generator.settings.connections, generator.settings.messagesPerSecond);
    assert.equal(generator.settings.roomIds.length, 1);
    assert.equal(generator.sentDuringWindow, planned);
    assert.equal(generator.acceptedMessages, planned);
    assert.equal(generator.endToEndAckMs.count, planned);
    assert.equal(generator.tenSecondWindows.length, 30);
    assert.equal(generator.deliveryVerification.expected, planned * generator.settings.connections);
    assert.equal(generator.deliveryVerification.uniqueReceived, generator.deliveryVerification.expected);
    assert.equal(api.postgresStatements.writeCalls, planned);
    assert.equal(rows, planned + generator.settings.connections);
    assert.equal(verdict(generator), expectedVerdict);
  });
}

test('275 messages/s has three valid passing runs', () => {
  const passing = ['275a', '275b', '275d'].map((run) =>
    verdict(readJson(`generator-${run}.json`)),
  );
  assert.deepEqual(passing, ['pass', 'pass', 'pass']);
});

test('cache reduces SELECT calls below one quarter per send', () => {
  for (const run of Object.keys(expectedVerdicts)) {
    const generator = readJson(`generator-${run}.json`);
    const api = readJson(`api-${run}.json`);
    assert.ok(
      api.postgresStatements.readCalls / generator.sentDuringWindow < 0.25,
      `${run} used too many SELECT calls`,
    );
  }
});
