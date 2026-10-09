import { describe, expect, it } from 'vitest';

import { resolveDatabaseUrl } from './database.service.js';

describe('resolveDatabaseUrl', () => {
  it('uses the configured database URL', () => {
    expect(
      resolveDatabaseUrl({
        databaseUrl: 'postgresql://user:password@database:5432/livepulse',
        nodeEnvironment: 'production',
      }),
    ).toBe('postgresql://user:password@database:5432/livepulse');
  });

  it('allows the documented local default outside production', () => {
    expect(
      resolveDatabaseUrl({
        databaseUrl: undefined,
        nodeEnvironment: 'development',
      }),
    ).toContain('@localhost:5432/livepulse');
  });

  it('fails fast when production has no database URL', () => {
    expect(() =>
      resolveDatabaseUrl({
        databaseUrl: undefined,
        nodeEnvironment: 'production',
      }),
    ).toThrow('DATABASE_URL is required in production');
  });
});
