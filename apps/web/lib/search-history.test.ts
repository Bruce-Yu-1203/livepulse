import { describe, expect, it } from 'vitest';

import {
  addSearchTerm,
  parseSearchHistory,
  removeSearchTerm,
  SEARCH_HISTORY_LIMIT,
} from './search-history';

describe('search history', () => {
  it('puts the newest term first without duplicates', () => {
    expect(addSearchTerm(['lofi', 'Design'], ' design ')).toEqual([
      'design',
      'lofi',
    ]);
  });

  it('ignores blank terms and caps the list', () => {
    expect(addSearchTerm(['a'], '   ')).toEqual(['a']);
    const many = ['1', '2', '3', '4', '5'];
    expect(addSearchTerm(many, '6')).toHaveLength(SEARCH_HISTORY_LIMIT);
    expect(addSearchTerm(many, '6')[0]).toBe('6');
  });

  it('removes a single term', () => {
    expect(removeSearchTerm(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('parses stored history defensively', () => {
    expect(parseSearchHistory(null)).toEqual([]);
    expect(parseSearchHistory('not json')).toEqual([]);
    expect(parseSearchHistory('{"a":1}')).toEqual([]);
    expect(parseSearchHistory('["a",2,"b"]')).toEqual(['a', 'b']);
  });
});
