import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiErrorCode } from '@livepulse/contracts';
import type { CurrentUserResponse } from '@livepulse/contracts';

import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { SessionGuard } from './session.guard.js';

@Controller('auth')
export class AuthController {
  public constructor(private readonly database: DatabaseService) {}

  @Get('me')
  @UseGuards(SessionGuard)
  public async me(
    @Req() request: AuthenticatedRequest,
  ): Promise<CurrentUserResponse> {
    const user = await this.database.client.user.findUnique({
      select: {
        createdAt: true,
        email: true,
        id: true,
        role: true,
      },
      where: { id: request.auth.userId },
    });

    if (!user) {
      throw new HttpException(
        {
          code: ApiErrorCode.Unauthorized,
          message: 'Authentication is required',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return {
      requestId: request.id,
      user: {
        ...user,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}
