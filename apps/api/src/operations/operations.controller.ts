import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { OperationsSummaryResponse } from '@livepulse/contracts';

import { AccessTokenGuard } from '../auth/access-token.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { AllowedRoles } from '../authorization/allowed-roles.decorator.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { OperationsService } from './operations.service.js';

@Controller('operations')
export class OperationsController {
  public constructor(
    @Inject(OperationsService)
    private readonly operations: OperationsService,
  ) {}

  @AllowedRoles('ADMIN')
  @Get('summary')
  @UseGuards(AccessTokenGuard, RolesGuard)
  public async summary(
    @Req() request: AuthenticatedRequest,
  ): Promise<OperationsSummaryResponse> {
    return {
      ...(await this.operations.getSummary()),
      generatedAt: new Date().toISOString(),
      requestId: request.id,
    };
  }
}
