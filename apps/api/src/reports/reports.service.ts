import { Inject, Injectable } from '@nestjs/common';
import type { CreateReportRequest } from '@livepulse/contracts';

import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';
import { MessagesService } from '../messages/messages.service.js';
import {
  ReportMessageNotFoundError,
  ReportOwnMessageError,
} from './reports.errors.js';
import type { ReportRecord, ReportsRepository } from './reports.repository.js';
import { REPORTS_REPOSITORY } from './reports.tokens.js';

@Injectable()
export class ReportsService {
  public constructor(
    @Inject(REPORTS_REPOSITORY)
    private readonly reports: ReportsRepository,
    @Inject(MessagesService) private readonly messages: MessagesService,
  ) {}

  public async create(
    actor: AuthenticatedPrincipal,
    input: CreateReportRequest,
  ): Promise<ReportRecord> {
    const message = await this.messages.findById(input.roomId, input.messageId);

    if (!message) {
      throw new ReportMessageNotFoundError();
    }

    if (message.authorId === actor.userId) {
      throw new ReportOwnMessageError();
    }

    return this.reports.create({
      ...(input.details ? { details: input.details } : {}),
      messageId: input.messageId,
      reason: input.reason,
      reporterId: actor.userId,
      roomId: input.roomId,
    });
  }
}
