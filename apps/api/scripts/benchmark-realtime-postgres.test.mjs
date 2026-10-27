import { describe, expect, it } from 'vitest';

import {
  readPostgresStatementSnapshot,
  summarizePostgresStatementDelta,
} from './benchmark-realtime-postgres.mjs';

describe('PostgreSQL benchmark statement accounting', () => {
  it('reads statement calls for the active database', async () => {
    const client = {
      $queryRawUnsafe: async (query) => {
        expect(query).toContain('current_database()');
        return [
          {
            userId: '1',
            databaseId: '2',
            queryId: '3',
            query: 'SELECT * FROM sessions',
            calls: '42',
          },
        ];
      },
    };

    expect(await readPostgresStatementSnapshot(client)).toEqual([
      { key: '1:2:3', query: 'SELECT * FROM sessions', calls: 42 },
    ]);
  });

  it('subtracts warm-up calls and separates reads from writes', () => {
    const before = [
      { key: '1:2:1', query: 'SELECT * FROM sessions', calls: 10 },
      { key: '1:2:2', query: 'INSERT INTO messages VALUES ($1)', calls: 3 },
    ];
    const after = [
      { key: '1:2:1', query: 'SELECT * FROM sessions', calls: 14 },
      { key: '1:2:2', query: 'INSERT INTO messages VALUES ($1)', calls: 5 },
      { key: '1:2:3', query: 'SELECT * FROM pg_stat_statements', calls: 1 },
      { key: '1:2:4', query: 'SELECT id FROM mutes', calls: 4 },
    ];

    expect(summarizePostgresStatementDelta(before, after)).toMatchObject({
      readCalls: 8,
      writeCalls: 2,
      otherCalls: 0,
      statements: [
        { kind: 'read', calls: 4 },
        { kind: 'read', calls: 4 },
        { kind: 'write', calls: 2 },
      ],
    });
  });
});
