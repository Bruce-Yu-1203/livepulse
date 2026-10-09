import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiErrorCode, ApiErrorResponseSchema } from '@livepulse/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/create-app.js';

describe('HTTP error responses', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('normalizes malformed JSON without exposing parser details', async () => {
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        payload: '{',
        url: '/api/v1/auth/register',
      });

    expect(response.statusCode).toBe(400);
    const error = ApiErrorResponseSchema.parse(response.json());
    expect(error.code).toBe(ApiErrorCode.ValidationError);
    expect(error.message).toBe('The request is invalid');
    expect(response.headers['x-request-id']).toBe(error.requestId);
  });
});
