import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiErrorCode,
  GetRoomParamsSchema,
  ListRoomMessagesQuerySchema,
} from '@livepulse/contracts';
import type { ListRoomMessagesResponse } from '@livepulse/contracts';
import type { FastifyRequest } from 'fastify';

import { RoomNotFoundError } from '../rooms/rooms.errors.js';
import {
  InvalidMessageCursorError,
  MessageDatabaseUnavailableError,
} from './messages.errors.js';
import { MessagesService } from './messages.service.js';

@Controller('rooms/:roomId/messages')
export class MessagesController {
  public constructor(
    @Inject(MessagesService) private readonly messages: MessagesService,
  ) {}

  @Get()
  public async list(
    @Param('roomId') roomId: string,
    @Query() query: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ListRoomMessagesResponse> {
    const parsedRoom = GetRoomParamsSchema.safeParse({ id: roomId });
    const parsedQuery = ListRoomMessagesQuerySchema.safeParse(query);

    if (!parsedRoom.success || !parsedQuery.success) {
      this.throwValidationError('The message-history request is invalid');
    }

    try {
      const page = await this.messages.list(
        parsedRoom.data.id,
        parsedQuery.data,
      );
      return { ...page, requestId: request.id };
    } catch (error) {
      if (error instanceof InvalidMessageCursorError) {
        this.throwValidationError(error.message);
      }

      if (error instanceof RoomNotFoundError) {
        throw new HttpException(
          { code: ApiErrorCode.NotFound, message: error.message },
          HttpStatus.NOT_FOUND,
        );
      }

      if (error instanceof MessageDatabaseUnavailableError) {
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
