/**
 * Summarizes latency samples. Sorts once and reads the maximum from the
 * sorted copy, so long high-rate runs never spread hundreds of thousands of
 * samples into Math.max arguments, which overflows the call stack.
 */
export function summary(values) {
  if (values.length === 0) {
    return { count: 0, p50: null, p95: null, p99: null, max: null };
  }

  const ordered = Float64Array.from(values).sort();
  const at = (p) =>
    Number(
      ordered[
        Math.min(ordered.length - 1, Math.ceil(p * ordered.length) - 1)
      ].toFixed(2),
    );

  return {
    count: values.length,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: Number(ordered[ordered.length - 1].toFixed(2)),
  };
}
