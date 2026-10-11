import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiErrorCode,
  ListAuditLogsQuerySchema,
  type ListAuditLogsResponse,
} from '@livepulse/contracts';

import { AccessTokenGuard } from '../auth/access-token.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { AllowedRoles } from '../authorization/allowed-roles.decorator.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import {
  AuditLogDatabaseUnavailableError,
  InvalidAuditLogCursorError,
} from './audit-logs.errors.js';
import { AuditLogsService } from './audit-logs.service.js';

@Controller('audit-logs')
export class AuditLogsController {
  public constructor(
    @Inject(AuditLogsService) private readonly auditLogs: AuditLogsService,
  ) {}

  @AllowedRoles('ADMIN')
  @Get()
  @UseGuards(AccessTokenGuard, RolesGuard)
  public async list(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ListAuditLogsResponse> {
    const parsed = ListAuditLogsQuerySchema.safeParse(query);

    if (!parsed.success) {
      this.throwValidationError('The audit-log query is invalid');
    }

    try {
      const page = await this.auditLogs.list(parsed.data);
      return {
        items: page.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
        nextCursor: page.nextCursor,
        requestId: request.id,
      };
    } catch (error) {
      if (error instanceof InvalidAuditLogCursorError) {
        this.throwValidationError(error.message);
      }

      if (error instanceof AuditLogDatabaseUnavailableError) {
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
