import { describe, expect, it } from 'vitest';

import { createDatabaseClient } from './client.js';

describe('createDatabaseClient', () => {
  it('creates a lazy PostgreSQL client without opening a connection', async () => {
    const client = createDatabaseClient(
      'postgresql://user:password@localhost:5432/database',
    );

    expect(client.user).toBeDefined();
    await client.$disconnect();
  });

  it('rejects a connection URL for another database protocol', () => {
    expect(() =>
      createDatabaseClient('mysql://user:password@localhost:3306/database'),
    ).toThrow('DATABASE_URL must use the PostgreSQL protocol');
  });
});
