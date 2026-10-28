import { RequestMethod } from '@nestjs/common';
import type { NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';

import { AppModule } from './app.module.js';
import { mountBetterAuth } from './auth/better-auth-handler.js';
import { BetterAuthService } from './auth/better-auth.service.js';
import { TurnstileVerifier } from './auth/turnstile-verifier.js';
import { ApiExceptionFilter } from './http/api-exception.filter.js';
import {
  registerHttpRateLimitHook,
  resolveTrustedProxyCidrs,
} from './rate-limit/http-rate-limit-hook.js';
import { HttpRateLimiter } from './rate-limit/http-rate-limiter.js';
import { RoomSocketIoServer } from './realtime/room-socket-io.server.js';
import type { RealtimeControl } from './realtime/realtime-coordination.js';
import { REALTIME_CONTROL } from './realtime/realtime.tokens.js';

export async function createApp(
  options: NestApplicationOptions = {},
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 3 * 1024 * 1024,
      trustProxy: resolveTrustedProxyCidrs(process.env.HTTP_TRUST_PROXY_CIDRS),
    }),
    options,
  );

  await app.register(fastifyCookie);

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();
  app.useGlobalFilters(new ApiExceptionFilter());

  const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;
  registerHttpRateLimitHook(fastify, app.get(HttpRateLimiter));
  mountBetterAuth(
    fastify,
    app.get(BetterAuthService),
    app.get(HttpRateLimiter),
    app.get(TurnstileVerifier),
    app.get<RealtimeControl>(REALTIME_CONTROL),
  );
  app.get(RoomSocketIoServer).attach(app.getHttpServer() as Server);

  return app;
}
