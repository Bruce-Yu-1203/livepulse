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
import {
  ApiErrorCode,
  CreateReportRequestSchema,
  type CreateReportResponse,
} from '@livepulse/contracts';

import { AccessTokenGuard } from '../auth/access-token.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { MessageDatabaseUnavailableError } from '../messages/messages.errors.js';
import {
  ReportDatabaseUnavailableError,
  ReportMessageNotFoundError,
  ReportOwnMessageError,
} from './reports.errors.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
export class ReportsController {
  public constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
  ) {}

  @Post()
  @UseGuards(AccessTokenGuard, CsrfGuard)
  public async create(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<CreateReportResponse> {
    const parsed = CreateReportRequestSchema.safeParse(body);

    if (!parsed.success) {
      this.throwValidationError('The message-report request is invalid');
    }

    try {
      const report = await this.reports.create(request.auth, parsed.data);

      return {
        report: {
          createdAt: report.createdAt.toISOString(),
          details: report.details,
          id: report.id,
          messageId: report.messageId,
          reason: report.reason,
          reporterId: report.reporterId,
          roomId: report.roomId,
          status: report.status,
        },
        requestId: request.id,
      };
    } catch (error) {
      if (error instanceof ReportMessageNotFoundError) {
        throw new HttpException(
          { code: ApiErrorCode.NotFound, message: error.message },
          HttpStatus.NOT_FOUND,
        );
      }

      if (error instanceof ReportOwnMessageError) {
        this.throwValidationError(error.message);
      }

      if (
        error instanceof ReportDatabaseUnavailableError ||
        error instanceof MessageDatabaseUnavailableError
      ) {
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
