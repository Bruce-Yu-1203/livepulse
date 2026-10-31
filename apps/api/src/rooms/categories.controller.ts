import { Controller, Get, Req } from '@nestjs/common';
import type { ListCategoriesResponse } from '@livepulse/contracts';
import type { FastifyRequest } from 'fastify';

import { CategoriesService } from './categories.service.js';

@Controller('categories')
export class CategoriesController {
  public constructor(private readonly categories: CategoriesService) {}

  @Get()
  public async list(
    @Req() request: FastifyRequest,
  ): Promise<ListCategoriesResponse> {
    return {
      items: await this.categories.list(),
      requestId: request.id,
    };
  }
}
