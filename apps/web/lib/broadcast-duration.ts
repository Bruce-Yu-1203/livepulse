export function formatBroadcastDuration(
  startedAt: string | null | undefined,
  nowMs: number,
): string {
  if (!startedAt) return '—';

  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs)) return '—';

  const seconds = Math.max(0, Math.floor((nowMs - startMs) / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}
