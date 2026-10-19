import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiErrorCode,
  GetRoomParamsSchema,
  MuteRoomUserRequestSchema,
  type MuteRoomUserResponse,
} from '@livepulse/contracts';

import { SessionGuard } from '../auth/session.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { AllowedRoles } from '../authorization/allowed-roles.decorator.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { RoomMutesService } from './room-mutes.service.js';
import {
  RoomDatabaseUnavailableError,
  RoomForbiddenError,
  RoomMuteSelfError,
  RoomMuteTargetNotFoundError,
  RoomNotFoundError,
} from './rooms.errors.js';

@Controller('rooms/:roomId/mutes')
export class RoomMutesController {
  public constructor(
    @Inject(RoomMutesService) private readonly mutes: RoomMutesService,
  ) {}

  @AllowedRoles('HOST', 'ADMIN')
  @Post()
  @UseGuards(SessionGuard, CsrfGuard, RolesGuard)
  public async mute(
    @Param('roomId') roomId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<MuteRoomUserResponse> {
    const parsedRoom = GetRoomParamsSchema.safeParse({ id: roomId });
    const parsedBody = MuteRoomUserRequestSchema.safeParse(body);

    if (!parsedRoom.success || !parsedBody.success) {
      this.throwValidationError('The room-mute request is invalid');
    }

    try {
      const mute = await this.mutes.mute(
        request.auth,
        parsedRoom.data.id,
        parsedBody.data,
      );

      return {
        mute: {
          ...mute,
          effectiveAt: mute.effectiveAt.toISOString(),
          expiresAt: mute.expiresAt.toISOString(),
        },
        requestId: request.id,
      };
    } catch (error) {
      if (
        error instanceof RoomNotFoundError ||
        error instanceof RoomMuteTargetNotFoundError
      ) {
        throw new HttpException(
          { code: ApiErrorCode.NotFound, message: error.message },
          HttpStatus.NOT_FOUND,
        );
      }

      if (error instanceof RoomForbiddenError) {
        throw new HttpException(
          { code: ApiErrorCode.Forbidden, message: error.message },
          HttpStatus.FORBIDDEN,
        );
      }

      if (error instanceof RoomMuteSelfError) {
        this.throwValidationError(error.message);
      }

      if (error instanceof RoomDatabaseUnavailableError) {
        throw new HttpException(
          { code: ApiErrorCode.ServiceUnavailable, message: error.message },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw error;
    }
  }

  private throwValidationError(message: string): never {
    throw new HttpException(
      { code: ApiErrorCode.ValidationError, message },
      HttpStatus.BAD_REQUEST,
    );
  }
}
