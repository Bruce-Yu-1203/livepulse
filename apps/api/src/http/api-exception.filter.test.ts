import { HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiExceptionFilter } from './api-exception.filter.js';

describe('API exception filter', () => {
  it('sets Retry-After for a rate-limited request', () => {
    const reply = {
      header: vi.fn().mockReturnThis(),
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ id: 'request-1' }),
        getResponse: () => reply,
      }),
    } as unknown as ArgumentsHost;
    new ApiExceptionFilter().catch(
      new HttpException(
        {
          code: 'REQUEST_RATE_LIMITED',
          message: 'Too many requests',
          retryAfterMs: 2_100,
        },
        429,
      ),
      host,
    );

    expect(reply.header).toHaveBeenCalledWith('Retry-After', '3');
    expect(reply.status).toHaveBeenCalledWith(429);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ retryAfterMs: 2_100 }),
    );
  });
});
