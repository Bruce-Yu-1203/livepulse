export function buildBroadcastHistorySearch(input: {
  cursor?: string;
  date: string;
  title: string;
}): string {
  const params = new URLSearchParams({ limit: '10' });
  if (input.cursor) params.set('cursor', input.cursor);
  if (input.title.trim()) params.set('q', input.title.trim());
  if (input.date) {
    const start = new Date(`${input.date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    params.set('from', start.toISOString());
    params.set('to', end.toISOString());
  }
  return params.toString();
}
