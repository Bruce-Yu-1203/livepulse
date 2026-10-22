export const SEARCH_HISTORY_KEY = 'livepulse-search-history';
export const SEARCH_HISTORY_LIMIT = 5;

// Newest first, case-insensitive de-duplication, capped length.
export function addSearchTerm(history: string[], term: string): string[] {
  const value = term.trim();
  if (!value) {
    return history;
  }
  const rest = history.filter(
    (item) => item.toLowerCase() !== value.toLowerCase(),
  );
  return [value, ...rest].slice(0, SEARCH_HISTORY_LIMIT);
}

export function removeSearchTerm(history: string[], term: string): string[] {
  return history.filter((item) => item !== term);
}

export function parseSearchHistory(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === 'string')
          .slice(0, SEARCH_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}
