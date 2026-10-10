import { describe, expect, it } from 'vitest';

import { resolveMongoUrl } from './messages.repository.js';

describe('MongoDB message configuration', () => {
  it('uses the configured URL and a local development default', () => {
    expect(
      resolveMongoUrl({
        mongoUrl: 'mongodb://database.example/livepulse',
        nodeEnvironment: 'production',
      }),
    ).toBe('mongodb://database.example/livepulse');
    expect(
      resolveMongoUrl({
        mongoUrl: undefined,
        nodeEnvironment: 'development',
      }),
    ).toBe('mongodb://localhost:27017/livepulse');
  });

  it('requires an explicit URL in production', () => {
    expect(() =>
      resolveMongoUrl({
        mongoUrl: undefined,
        nodeEnvironment: 'production',
      }),
    ).toThrow('MONGODB_URL is required in production');
  });
});
