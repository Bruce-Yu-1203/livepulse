/**
 * Estimate how long each eventually persisted measurement message took to
 * appear in PostgreSQL, using only the per-second sampler row count.
 *
 * Messages are ordered by their scheduled send time and assumed to reach the
 * table in that order, which holds per room/partition and approximately
 * overall. The k-th persisted message is considered stored at the first sample
 * whose measured row count reaches k. Sampling makes each delay accurate to
 * about one second, so sub-second delays are reported as 0.
 */
export function estimatePersistenceDelays({ samples, generators, warmupRows }) {
  const anchor = generators[0].windowStartedAtEpochMs;
  const baseSample = samples.findLast((sample) => sample.epoch_ms <= anchor);
  const baseRows = baseSample?.danmaku_rows ?? 0;
  const sendTimes = [];
  for (const generator of generators) {
    const intervalMs = 1_000 / generator.messagesPerSecond;
    for (const index of generator.persistedIndexes) {
      sendTimes.push(generator.windowStartedAtEpochMs + index * intervalMs);
    }
  }
  sendTimes.sort((left, right) => left - right);

  // Rows written after the window started that are not measurement rows,
  // such as a later generator's warm-up messages, are removed once that
  // generator's window has begun.
  const measuredRows = (sample) =>
    sample.danmaku_rows -
    baseRows -
    warmupRows
      .filter((warmup) => sample.epoch_ms >= warmup.afterEpochMs)
      .reduce((total, warmup) => total + warmup.rows, 0);

  const delays = [];
  const windows = new Map();
  let sampleIndex = 0;
  for (let k = 0; k < sendTimes.length; k += 1) {
    while (
      sampleIndex < samples.length &&
      (samples[sampleIndex].epoch_ms < sendTimes[k] ||
        measuredRows(samples[sampleIndex]) < k + 1)
    ) {
      sampleIndex += 1;
    }
    if (sampleIndex >= samples.length) break;
    const delaySeconds = Math.max(
      0,
      (samples[sampleIndex].epoch_ms - sendTimes[k]) / 1_000 - 1,
    );
    delays.push(delaySeconds);
    const window = Math.floor((sendTimes[k] - anchor) / 10_000) * 10;
    if (!windows.has(window)) windows.set(window, []);
    windows.get(window).push(delaySeconds);
  }

  const windowP95 = [...windows].map(([fromSecond, values]) => ({
    fromSecond,
    p95: quantile(values, 0.95),
  }));
  const worst = windowP95.reduce(
    (peak, window) => (window.p95 > (peak?.p95 ?? -1) ? window : peak),
    null,
  );
  return {
    messages: sendTimes.length,
    estimated: delays.length,
    p50Seconds: quantile(delays, 0.5),
    p95Seconds: quantile(delays, 0.95),
    p99Seconds: quantile(delays, 0.99),
    maxSeconds: delays.length ? round(Math.max(...delays)) : null,
    worstTenSecondP95Seconds: worst?.p95 ?? null,
    worstTenSecondFromSecond: worst?.fromSecond ?? null,
    resolutionSeconds: 1,
  };
}

function quantile(values, fraction) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return round(
    ordered[
      Math.min(ordered.length - 1, Math.ceil(fraction * ordered.length) - 1)
    ],
  );
}

function round(value) {
  return Number(value.toFixed(1));
}
