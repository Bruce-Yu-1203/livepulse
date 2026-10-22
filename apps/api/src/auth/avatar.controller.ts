import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiErrorCode } from '@livepulse/contracts';
import type { AvatarUploadResponse } from '@livepulse/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AuthenticatedRequest } from './authenticated-request.js';
import { AvatarService } from './avatar.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { SessionGuard } from './session.guard.js';

@Controller('users')
export class AvatarController {
  public constructor(private readonly avatars: AvatarService) {}

  @Post('me/avatar')
  @UseGuards(CsrfGuard, SessionGuard)
  public async upload(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<AvatarUploadResponse> {
    const avatarUrl = await this.avatars.upload(request.auth.userId, body);
    return { avatarUrl, requestId: request.id };
  }

  @Get(':userId/avatar')
  public async read(
    @Param('userId') userId: string,
    @Res() reply: FastifyReply,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
        userId,
      )
    ) {
      throw new HttpException(
        { code: ApiErrorCode.NotFound, message: 'Avatar not found' },
        HttpStatus.NOT_FOUND,
      );
    }
    const avatar = await this.avatars.read(userId);
    void reply
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Content-Type', avatar.contentType)
      .header('X-Content-Type-Options', 'nosniff')
      .header('x-request-id', request.id)
      .send(avatar.body);
  }
}
