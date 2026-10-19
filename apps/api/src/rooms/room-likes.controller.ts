import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiErrorCode,
  GetRoomParamsSchema,
  type RoomLikeResponse,
} from '@livepulse/contracts';

import { SessionGuard } from '../auth/session.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { RoomLikesService } from './room-likes.service.js';
import {
  RoomDatabaseUnavailableError,
  RoomNotFoundError,
} from './rooms.errors.js';

@Controller('rooms/:roomId/likes')
export class RoomLikesController {
  public constructor(
    @Inject(RoomLikesService) private readonly likes: RoomLikesService,
  ) {}

  @Get('me')
  @UseGuards(SessionGuard)
  public async getMine(
    @Param('roomId') roomId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoomLikeResponse> {
    return this.respond(roomId, request, undefined);
  }

  @Put('me')
  @UseGuards(SessionGuard, CsrfGuard)
  public async like(
    @Param('roomId') roomId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoomLikeResponse> {
    return this.respond(roomId, request, true);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard, CsrfGuard)
  public async unlike(
    @Param('roomId') roomId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.respond(roomId, request, false);
  }

  private async respond(
    roomId: string,
    request: AuthenticatedRequest,
    liked: boolean | undefined,
  ): Promise<RoomLikeResponse> {
    const parsed = GetRoomParamsSchema.safeParse({ id: roomId });

    if (!parsed.success) {
      throw new HttpException(
        {
          code: ApiErrorCode.ValidationError,
          message: 'The room identifier is invalid',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const summary =
        liked === undefined
          ? await this.likes.get(parsed.data.id, request.auth.userId)
          : await this.likes.setLiked(
              parsed.data.id,
              request.auth.userId,
              liked,
            );

      return { ...summary, requestId: request.id };
    } catch (error) {
      if (error instanceof RoomNotFoundError) {
        throw new HttpException(
          { code: ApiErrorCode.NotFound, message: error.message },
          HttpStatus.NOT_FOUND,
        );
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
}
