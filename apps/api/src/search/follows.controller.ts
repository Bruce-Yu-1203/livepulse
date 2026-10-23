import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiErrorCode,
  FollowListQuerySchema,
  GetPublicUserParamsSchema,
} from '@livepulse/contracts';
import type {
  FollowListResponse,
  FollowStateResponse,
} from '@livepulse/contracts';
import type { FastifyRequest } from 'fastify';

import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { FollowsService } from './follows.service.js';

@Controller('users')
export class FollowsController {
  public constructor(private readonly follows: FollowsService) {}

  @Get(':id/followers')
  public async followers(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() request: FastifyRequest,
  ): Promise<FollowListResponse> {
    return this.list(id, 'followers', query, request);
  }

  @Get(':id/following')
  public async following(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() request: FastifyRequest,
  ): Promise<FollowListResponse> {
    return this.list(id, 'following', query, request);
  }

  @Get(':id/follow')
  @UseGuards(SessionGuard)
  public async state(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<FollowStateResponse> {
    const state = await this.follows.state(
      this.userId(id),
      request.auth.userId,
    );
    if (!state) this.notFound();
    return { ...state, requestId: request.id };
  }

  @Put(':id/follow')
  @UseGuards(CsrfGuard, SessionGuard)
  public async follow(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<FollowStateResponse> {
    return this.setFollowing(id, request, true);
  }

  @Delete(':id/follow')
  @UseGuards(CsrfGuard, SessionGuard)
  public async unfollow(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<FollowStateResponse> {
    return this.setFollowing(id, request, false);
  }

  private async list(
    id: string,
    kind: 'followers' | 'following',
    query: unknown,
    request: FastifyRequest,
  ): Promise<FollowListResponse> {
    const parsed = FollowListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new HttpException(
        {
          code: ApiErrorCode.ValidationError,
          message: 'Invalid follow list query',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.follows.list(this.userId(id), kind, parsed.data);
    if (!result) this.notFound();
    return { ...result, requestId: request.id };
  }

  private async setFollowing(
    id: string,
    request: AuthenticatedRequest,
    follow: boolean,
  ): Promise<FollowStateResponse> {
    const result = await this.follows.setFollowing(
      this.userId(id),
      request.auth.userId,
      follow,
    );
    if (!result) this.notFound();
    if ('self' in result) {
      throw new HttpException(
        {
          code: ApiErrorCode.ValidationError,
          message: 'You cannot follow yourself',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return { ...result, requestId: request.id };
  }

  private userId(id: string): string {
    if (!GetPublicUserParamsSchema.safeParse({ id }).success) this.notFound();
    return id;
  }

  private notFound(): never {
    throw new HttpException(
      { code: ApiErrorCode.NotFound, message: 'User not found' },
      HttpStatus.NOT_FOUND,
    );
  }
}
