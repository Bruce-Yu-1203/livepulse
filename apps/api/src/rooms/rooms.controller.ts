import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiErrorCode, CreateRoomRequestSchema } from '@livepulse/contracts';
import type { CreateRoomResponse } from '@livepulse/contracts';

import { AccessTokenGuard } from '../auth/access-token.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { AllowedRoles } from '../authorization/allowed-roles.decorator.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import {
  RoomDatabaseUnavailableError,
  RoomHostNotFoundError,
} from './rooms.errors.js';
import { RoomsService } from './rooms.service.js';

@Controller('rooms')
export class RoomsController {
  public constructor(
    @Inject(RoomsService) private readonly rooms: RoomsService,
  ) {}

  @AllowedRoles('HOST', 'ADMIN')
  @Post()
  @UseGuards(AccessTokenGuard, CsrfGuard, RolesGuard)
  public async create(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<CreateRoomResponse> {
    const parsed = CreateRoomRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpException(
        {
          code: ApiErrorCode.ValidationError,
          message: 'The create-room request is invalid',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const room = await this.rooms.create(request.auth.userId, parsed.data);

      return {
        requestId: request.id,
        room: {
          ...room,
          createdAt: room.createdAt.toISOString(),
          updatedAt: room.updatedAt.toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof RoomHostNotFoundError) {
        throw new HttpException(
          {
            code: ApiErrorCode.Unauthorized,
            message: 'Authentication is required',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (error instanceof RoomDatabaseUnavailableError) {
        throw new HttpException(
          {
            code: ApiErrorCode.ServiceUnavailable,
            message: error.message,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw error;
    }
  }
}
