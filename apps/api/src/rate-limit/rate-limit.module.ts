import { Module } from '@nestjs/common';

import { HttpRateLimiter } from './http-rate-limiter.js';

@Module({
  exports: [HttpRateLimiter],
  providers: [HttpRateLimiter],
})
export class RateLimitModule {}
