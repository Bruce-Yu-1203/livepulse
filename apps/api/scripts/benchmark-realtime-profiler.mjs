import { performance } from 'node:perf_hooks';

export const stageNames = [
  'sessionCheckMs',
  'roomLiveCheckMs',
  'muteCheckMs',
  'postgresInsertMs',
  'redisRateLimitMs',
  'redisMessagePublishMs',
  'hubHandleMs',
  'localBroadcastMs',
];

export function summarize(values) {
  if (values.length === 0) {
    return { count: 0, p50: null, p95: null, p99: null, max: null };
  }
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = (fraction) =>
    Number(
      ordered[
        Math.min(ordered.length - 1, Math.ceil(fraction * ordered.length) - 1)
      ].toFixed(2),
    );
  return {
    count: values.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: Number(ordered.at(-1).toFixed(2)),
  };
}

export function createStageProfiler() {
  const samples = new Map(stageNames.map((name) => [name, []]));
  let collecting = false;

  return {
    start() {
      for (const values of samples.values()) values.length = 0;
      collecting = true;
    },
    stop() {
      collecting = false;
    },
    wrap(target, methodName, sampleName, predicate = () => true) {
      const original = target[methodName].bind(target);
      target[methodName] = async (...args) => {
        const shouldRecord = collecting && predicate(...args);
        const startedAt = performance.now();
        try {
          return await original(...args);
        } finally {
          if (shouldRecord) {
            samples.get(sampleName).push(performance.now() - startedAt);
          }
        }
      };
    },
    wrapSync(target, methodName, sampleName, predicate = () => true) {
      const original = target[methodName].bind(target);
      target[methodName] = (...args) => {
        const shouldRecord = collecting && predicate(...args);
        const startedAt = performance.now();
        try {
          return original(...args);
        } finally {
          if (shouldRecord) {
            samples.get(sampleName).push(performance.now() - startedAt);
          }
        }
      };
    },
    snapshot() {
      return Object.fromEntries(
        [...samples].map(([name, values]) => [name, summarize(values)]),
      );
    },
  };
}

export function waitForExclusiveSignal(emitter, signal) {
  emitter.removeAllListeners(signal);
  return new Promise((resolve) => emitter.once(signal, resolve));
}
