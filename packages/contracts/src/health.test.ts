import { describe, expect, it } from 'vitest';

import { HealthResponseSchema } from './health.js';

describe('HealthResponseSchema', () => {
  it('accepts a healthy service response', () => {
    expect(
      HealthResponseSchema.parse({ service: 'api', status: 'ok' }),
    ).toEqual({ service: 'api', status: 'ok' });
  });

  it('rejects unsupported health states', () => {
    expect(
      HealthResponseSchema.safeParse({ service: 'api', status: 'degraded' })
        .success,
    ).toBe(false);
  });
});
