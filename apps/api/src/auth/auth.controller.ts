import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiErrorCode } from '@livepulse/contracts';
import type {
  AuthProvidersResponse,
  CurrentUserResponse,
} from '@livepulse/contracts';

import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { BetterAuthService } from './better-auth.service.js';
import { AvatarService } from './avatar.service.js';
import { SessionGuard } from './session.guard.js';

@Controller('auth')
export class AuthController {
  public constructor(
    private readonly authentication: BetterAuthService,
    private readonly database: DatabaseService,
    private readonly avatars: AvatarService,
  ) {}

  @Get('providers')
  public providers(): AuthProvidersResponse {
    return {
      providers: [...this.authentication.enabledSocialProviders],
    };
  }

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
        username: true,
        avatarKey: true,
        image: true,
        updatedAt: true,
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
        id: user.id,
        email: user.email,
        role: user.role,
        username: user.username,
        avatarUrl: user.avatarKey
          ? this.avatars.avatarUrl(user.id, user.updatedAt)
          : user.image && /^https?:\/\//u.test(user.image)
            ? user.image
            : null,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}
