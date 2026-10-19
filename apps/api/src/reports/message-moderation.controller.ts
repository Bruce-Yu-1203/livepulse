import {
  Controller,
  Delete,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiErrorCode,
  ModerateMessageParamsSchema,
} from '@livepulse/contracts';

import { SessionGuard } from '../auth/session.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { AllowedRoles } from '../authorization/allowed-roles.decorator.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { MessageDatabaseUnavailableError } from '../messages/messages.errors.js';
import {
  ReportDatabaseUnavailableError,
  ReportMessageNotFoundError,
} from './reports.errors.js';
import { ReportsService } from './reports.service.js';

@Controller('rooms/:roomId/messages')
export class MessageModerationController {
  public constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
  ) {}

  @AllowedRoles('ADMIN')
  @Delete(':messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard, CsrfGuard, RolesGuard)
  public async deleteMessage(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const parsed = ModerateMessageParamsSchema.safeParse(params);

    if (!parsed.success) {
      throw new HttpException(
        {
          code: ApiErrorCode.ValidationError,
          message: 'The moderation target is invalid',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await this.reports.deleteMessage(
        request.auth,
        parsed.data.roomId,
        parsed.data.messageId,
      );
    } catch (error) {
      if (error instanceof ReportMessageNotFoundError) {
        throw new HttpException(
          { code: ApiErrorCode.NotFound, message: error.message },
          HttpStatus.NOT_FOUND,
        );
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
}
