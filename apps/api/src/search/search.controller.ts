import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiErrorCode,
  GetPublicUserParamsSchema,
  SearchQuerySchema,
} from '@livepulse/contracts';
import type {
  GetPublicUserResponse,
  SearchSuggestionsResponse,
} from '@livepulse/contracts';
import type { FastifyRequest } from 'fastify';

import { SearchService } from './search.service.js';

@Controller('search')
export class SearchController {
  public constructor(private readonly search: SearchService) {}

  @Get()
  public async suggestions(
    @Query() query: unknown,
    @Req() request: FastifyRequest,
  ): Promise<SearchSuggestionsResponse> {
    const parsed = SearchQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new HttpException(
        {
          code: ApiErrorCode.ValidationError,
          message: 'The search query is invalid',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return {
      ...(await this.search.search(parsed.data)),
      requestId: request.id,
    };
  }
}

@Controller('users')
export class PublicUsersController {
  public constructor(private readonly search: SearchService) {}

  @Get(':id')
  public async get(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<GetPublicUserResponse> {
    const parsed = GetPublicUserParamsSchema.safeParse({ id });
    if (!parsed.success) {
      throw new HttpException(
        { code: ApiErrorCode.NotFound, message: 'User not found' },
        HttpStatus.NOT_FOUND,
      );
    }
    const user = await this.search.getUser(parsed.data.id);
    if (!user) {
      throw new HttpException(
        { code: ApiErrorCode.NotFound, message: 'User not found' },
        HttpStatus.NOT_FOUND,
      );
    }
    return { requestId: request.id, user };
  }
}
