import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorCode,
  ApiErrorResponseSchema,
  HealthResponseSchema,
} from '@livepulse/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/create-app.js';

describe('health endpoints', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(['/health/live', '/health/ready'])(
    'returns a valid response from %s',
    async (url) => {
      const response = await app.getHttpAdapter().getInstance().inject({
        method: 'GET',
        url,
      });

      expect(response.statusCode).toBe(200);
      expect(HealthResponseSchema.parse(response.json())).toEqual({
        service: 'api',
        status: 'ok',
      });
    },
  );

  it('does not place operational health checks under the API prefix', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/api/v1/health/live',
    });

    expect(response.statusCode).toBe(404);
    const error = ApiErrorResponseSchema.parse(response.json());
    expect(error.code).toBe(ApiErrorCode.NotFound);
    expect(response.headers['x-request-id']).toBe(error.requestId);
  });
});
