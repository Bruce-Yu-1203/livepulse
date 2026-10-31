/**
 * Chat entry motion is switched off while messages arrive faster than people
 * can read them, so a busy room does not jitter.
 */
export const chatBurstWindowMs = 2_000;
export const chatBurstThreshold = 6;

/** Keeps only arrivals inside the burst window, newest last. */
export function recentArrivals(
  arrivals: readonly number[],
  now: number,
  windowMs = chatBurstWindowMs,
): number[] {
  return arrivals.filter((time) => now - time < windowMs);
}

/** True when more than `threshold` messages arrived inside the window. */
export function isChatBurst(
  arrivals: readonly number[],
  now: number,
  threshold = chatBurstThreshold,
): boolean {
  return recentArrivals(arrivals, now).length > threshold;
}
