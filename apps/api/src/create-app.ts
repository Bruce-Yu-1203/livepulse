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
import { ApiExceptionFilter } from './http/api-exception.filter.js';
import { RoomSocketIoServer } from './realtime/room-socket-io.server.js';

export async function createApp(
  options: NestApplicationOptions = {},
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 3 * 1024 * 1024 }),
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
  mountBetterAuth(fastify, app.get(BetterAuthService));
  fastify.addHook('onRequest', (request, reply, done) => {
    void reply.header('x-request-id', request.id);
    done();
  });
  app.get(RoomSocketIoServer).attach(app.getHttpServer() as Server);

  return app;
}
