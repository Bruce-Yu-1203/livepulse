import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { CreateReportRequest, RoomMessage } from '@livepulse/contracts';

import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';
import { MessagesService } from '../messages/messages.service.js';
import type { RealtimeEventBus } from '../realtime/realtime-coordination.js';
import { REALTIME_EVENT_BUS } from '../realtime/realtime.tokens.js';
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
    @Inject(REALTIME_EVENT_BUS) private readonly eventBus: RealtimeEventBus,
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

  public async listPending(): Promise<
    Array<{ message: RoomMessage | null; report: ReportRecord }>
  > {
    const reports = await this.reports.listPending(50);

    return Promise.all(
      reports.map(async (report) => ({
        message:
          (await this.messages.findById(report.roomId, report.messageId)) ??
          null,
        report,
      })),
    );
  }

  public async deleteMessage(
    actor: AuthenticatedPrincipal,
    roomId: string,
    messageId: string,
  ): Promise<void> {
    const deletedAt = new Date();
    const message = await this.messages.delete(roomId, messageId, deletedAt);

    if (!message) {
      throw new ReportMessageNotFoundError();
    }

    await this.reports.recordDeletion({
      actorId: actor.userId,
      deletedAt,
      messageId,
      roomId,
    });

    try {
      await this.eventBus.publish({
        payload: { deletedAt: deletedAt.toISOString(), messageId, roomId },
        requestId: randomUUID(),
        type: 'message.deleted',
        v: 1,
      });
    } catch {
      // History synchronization remains authoritative when live delivery fails.
    }
  }
}
