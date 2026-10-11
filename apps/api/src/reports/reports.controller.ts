import {
  Body,
  Controller,
  Get,
  HttpCode,
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
  CreateReportRequestSchema,
  type CreateReportResponse,
  ListReportsQuerySchema,
  type ListReportsResponse,
  UpdateReportParamsSchema,
  UpdateReportRequestSchema,
} from '@livepulse/contracts';

import { AccessTokenGuard } from '../auth/access-token.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { AllowedRoles } from '../authorization/allowed-roles.decorator.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { MessageDatabaseUnavailableError } from '../messages/messages.errors.js';
import {
  InvalidReportCursorError,
  ReportAlreadyActionedError,
  ReportDatabaseUnavailableError,
  ReportMessageNotFoundError,
  ReportNotFoundError,
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

  @AllowedRoles('ADMIN')
  @Get()
  @UseGuards(AccessTokenGuard, RolesGuard)
  public async list(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ListReportsResponse> {
    const parsed = ListReportsQuerySchema.safeParse(query);

    if (!parsed.success) {
      this.throwValidationError('The report-list query is invalid');
    }

    try {
      const page = await this.reports.listPending(parsed.data);

      return {
        items: page.items.map(({ message, report }) => ({
          createdAt: report.createdAt.toISOString(),
          details: report.details,
          id: report.id,
          message,
          messageId: report.messageId,
          reason: report.reason,
          reporterId: report.reporterId,
          roomId: report.roomId,
          status: report.status,
        })),
        nextCursor: page.nextCursor,
        requestId: request.id,
      };
    } catch (error) {
      if (error instanceof InvalidReportCursorError) {
        this.throwValidationError(error.message);
      }
      this.throwUnavailable(error);
    }
  }

  @AllowedRoles('ADMIN')
  @Patch(':reportId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard, CsrfGuard, RolesGuard)
  public async dismiss(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const parsedParams = UpdateReportParamsSchema.safeParse(params);
    const parsedBody = UpdateReportRequestSchema.safeParse(body);

    if (!parsedParams.success || !parsedBody.success) {
      this.throwValidationError('The report update request is invalid');
    }

    try {
      await this.reports.dismiss(request.auth, parsedParams.data.reportId);
    } catch (error) {
      if (error instanceof ReportNotFoundError) {
        throw new HttpException(
          { code: ApiErrorCode.NotFound, message: error.message },
          HttpStatus.NOT_FOUND,
        );
      }

      if (error instanceof ReportAlreadyActionedError) {
        throw new HttpException(
          {
            code: ApiErrorCode.ReportAlreadyActioned,
            message: error.message,
          },
          HttpStatus.CONFLICT,
        );
      }

      this.throwUnavailable(error);
    }
  }

  private throwValidationError(message: string): never {
    throw new HttpException(
      { code: ApiErrorCode.ValidationError, message },
      HttpStatus.BAD_REQUEST,
    );
  }

  private throwUnavailable(error: unknown): never {
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
