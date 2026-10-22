import { describe, expect, it } from 'vitest';

import { buildBroadcastHistorySearch } from './studio-history';

describe('buildBroadcastHistorySearch', () => {
  it('builds one page with a normalized title and opaque cursor', () => {
    const params = new URLSearchParams(
      buildBroadcastHistorySearch({
        cursor: 'page-2',
        date: '',
        title: '  Design critique  ',
      }),
    );
    expect(Object.fromEntries(params)).toEqual({
      cursor: 'page-2',
      limit: '10',
      q: 'Design critique',
    });
  });

  it('uses the selected local calendar day as a half-open date range', () => {
    const params = new URLSearchParams(
      buildBroadcastHistorySearch({ date: '2026-10-22', title: '' }),
    );
    expect(params.get('from')).toBe(new Date(2026, 9, 22).toISOString());
    expect(params.get('to')).toBe(new Date(2026, 9, 23).toISOString());
  });
});
