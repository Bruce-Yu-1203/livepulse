import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type {
  RegistrationCompleteResponse,
  RegistrationStartResponse,
} from '@livepulse/contracts';
import type { FastifyRequest } from 'fastify';

import { getHttpClientIp } from '../rate-limit/http-client-ip.js';
import { CsrfGuard } from './csrf.guard.js';
import { RegistrationService } from './registration.service.js';

@Controller('auth/registration')
@UseGuards(CsrfGuard)
export class RegistrationController {
  public constructor(private readonly registration: RegistrationService) {}

  @Post('start')
  public async start(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<RegistrationStartResponse> {
    await this.registration.start(body, getHttpClientIp(request));
    return {
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
      requestId: request.id,
    };
  }

  @Post('complete')
  public async complete(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<RegistrationCompleteResponse> {
    const userId = await this.registration.complete(body);
    return { requestId: request.id, userId };
  }
}
