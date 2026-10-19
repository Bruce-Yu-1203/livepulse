import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
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
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        method: 'POST',
        payload: '{',
        url: '/api/v1/auth/sign-up/email',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('stack');
    expect(response.headers['x-request-id']).toBeTypeOf('string');
  });
});
