import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@livepulse/contracts';

import type {
  HttpIdentityPolicy,
  HttpRateLimiter,
} from './http-rate-limiter.js';

export async function enforceIdentityRateLimit(
  limiter: Pick<HttpRateLimiter, 'consumeIdentity'>,
  policy: HttpIdentityPolicy,
  userId: string,
): Promise<void> {
  let retryAfterMs: number | undefined;
  try {
    retryAfterMs = await limiter.consumeIdentity(policy, userId);
  } catch {
    throw new HttpException(
      {
        code: ApiErrorCode.ServiceUnavailable,
        message: 'The service is temporarily unavailable',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
  if (retryAfterMs !== undefined) {
    throw new HttpException(
      {
        code: ApiErrorCode.RequestRateLimited,
        message: 'Too many requests. Please try again later.',
        retryAfterMs,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
