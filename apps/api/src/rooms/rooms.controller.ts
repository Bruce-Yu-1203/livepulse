import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiErrorCode,
  CreateRoomRequestSchema,
  GetRoomParamsSchema,
  ListRoomsQuerySchema,
  UpdateRoomRequestSchema,
} from '@livepulse/contracts';
import type {
  CreateRoomResponse,
  GetRoomResponse,
  ListOwnedRoomsResponse,
  ListRoomsResponse,
  UpdateRoomResponse,
} from '@livepulse/contracts';
import type { FastifyRequest } from 'fastify';

import { AccessTokenGuard } from '../auth/access-token.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { AllowedRoles } from '../authorization/allowed-roles.decorator.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import {
  InvalidRoomCursorError,
  InvalidRoomTransitionError,
  RoomDatabaseUnavailableError,
  RoomForbiddenError,
  RoomHostNotFoundError,
  RoomNotFoundError,
  RoomVersionConflictError,
} from './rooms.errors.js';
import type { RoomRecord } from './rooms.repository.js';
import { RoomsService } from './rooms.service.js';

@Controller('rooms')
export class RoomsController {
  public constructor(
    @Inject(RoomsService) private readonly rooms: RoomsService,
  ) {}

  @Get()
  public async list(
    @Query() query: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ListRoomsResponse> {
    const parsed = ListRoomsQuerySchema.safeParse(query);

    if (!parsed.success) {
      this.throwValidationError('The room-list query is invalid');
    }

    try {
      const page = await this.rooms.list(parsed.data);

      return {
        items: page.items.map((room) => this.serializeRoom(room)),
        nextCursor: page.nextCursor,
        requestId: request.id,
      };
    } catch (error) {
      this.throwRoomError(error);
    }
  }

  @AllowedRoles('HOST', 'ADMIN')
  @Get('mine')
  @UseGuards(AccessTokenGuard, RolesGuard)
  public async listOwned(
    @Req() request: AuthenticatedRequest,
  ): Promise<ListOwnedRoomsResponse> {
    try {
      const rooms = await this.rooms.listOwned(request.auth.userId);

      return {
        items: rooms.map((room) => this.serializeRoom(room)),
        requestId: request.id,
      };
    } catch (error) {
      this.throwRoomError(error);
    }
  }

  @Get(':id')
  public async get(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<GetRoomResponse> {
    const parsed = GetRoomParamsSchema.safeParse({ id });

    if (!parsed.success) {
      this.throwValidationError('The room identifier is invalid');
    }

    try {
      const room = await this.rooms.getVisible(parsed.data.id);

      return {
        requestId: request.id,
        room: this.serializeRoom(room),
      };
    } catch (error) {
      this.throwRoomError(error);
    }
  }

  @AllowedRoles('HOST', 'ADMIN')
  @Post()
  @UseGuards(AccessTokenGuard, CsrfGuard, RolesGuard)
  public async create(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<CreateRoomResponse> {
    const parsed = CreateRoomRequestSchema.safeParse(body);

    if (!parsed.success) {
      this.throwValidationError('The create-room request is invalid');
    }

    try {
      const room = await this.rooms.create(request.auth.userId, parsed.data);

      return {
        requestId: request.id,
        room: this.serializeRoom(room),
      };
    } catch (error) {
      this.throwRoomError(error);
    }
  }

  @AllowedRoles('HOST', 'ADMIN')
  @Patch(':id')
  @UseGuards(AccessTokenGuard, CsrfGuard, RolesGuard)
  public async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<UpdateRoomResponse> {
    const parsedId = GetRoomParamsSchema.safeParse({ id });
    const parsedBody = UpdateRoomRequestSchema.safeParse(body);

    if (!parsedId.success || !parsedBody.success) {
      this.throwValidationError('The update-room request is invalid');
    }

    try {
      const room = await this.rooms.update(
        request.auth,
        parsedId.data.id,
        parsedBody.data,
      );

      return {
        requestId: request.id,
        room: this.serializeRoom(room),
      };
    } catch (error) {
      this.throwRoomError(error);
    }
  }

  private serializeRoom<T extends RoomRecord>(room: T) {
    return {
      ...room,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
    };
  }

  private throwValidationError(message: string): never {
    throw new HttpException(
      {
        code: ApiErrorCode.ValidationError,
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private throwRoomError(error: unknown): never {
    if (error instanceof InvalidRoomCursorError) {
      this.throwValidationError(error.message);
    }

    if (error instanceof RoomNotFoundError) {
      throw new HttpException(
        {
          code: ApiErrorCode.NotFound,
          message: error.message,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (error instanceof RoomForbiddenError) {
      throw new HttpException(
        {
          code: ApiErrorCode.Forbidden,
          message: error.message,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (error instanceof InvalidRoomTransitionError) {
      throw new HttpException(
        {
          code: ApiErrorCode.RoomInvalidTransition,
          message: error.message,
        },
        HttpStatus.CONFLICT,
      );
    }

    if (error instanceof RoomVersionConflictError) {
      throw new HttpException(
        {
          code: ApiErrorCode.RoomVersionConflict,
          message: error.message,
        },
        HttpStatus.CONFLICT,
      );
    }

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
