import { Controller, Get, Req } from '@nestjs/common';
import type { LiveChannelsResponse } from '@livepulse/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';

import { BetterAuthService } from '../auth/better-auth.service.js';
import { LiveChannelsService } from './live-channels.service.js';

@Controller('rooms/channels')
export class LiveChannelsController {
  public constructor(
    private readonly channels: LiveChannelsService,
    private readonly authentication: BetterAuthService,
  ) {}

  @Get()
  public async list(
    @Req() request: FastifyRequest,
  ): Promise<LiveChannelsResponse> {
    const principal = await this.authentication
      .principalFromHeaders(fromNodeHeaders(request.headers))
      .catch(() => null);
    return {
      items: await this.channels.list(principal?.userId),
      requestId: request.id,
    };
  }
}
