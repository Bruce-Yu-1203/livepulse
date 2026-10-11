import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateReportRequest,
  ListReportsQuery,
  RoomMessage,
} from '@livepulse/contracts';

import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';
import { MessagesService } from '../messages/messages.service.js';
import type { RealtimeEventBus } from '../realtime/realtime-coordination.js';
import { REALTIME_EVENT_BUS } from '../realtime/realtime.tokens.js';
import { ReportCursorCodec } from './report-cursor.js';
import {
  ReportAlreadyActionedError,
  ReportMessageNotFoundError,
  ReportNotFoundError,
  ReportOwnMessageError,
} from './reports.errors.js';
import type { ReportRecord, ReportsRepository } from './reports.repository.js';
import { REPORTS_REPOSITORY } from './reports.tokens.js';

@Injectable()
export class ReportsService {
  private readonly cursorCodec = new ReportCursorCodec();

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

  public async listPending(query: ListReportsQuery): Promise<{
    items: Array<{ message: RoomMessage | null; report: ReportRecord }>;
    nextCursor: string | null;
  }> {
    const cursor = query.cursor
      ? this.cursorCodec.decode(query.cursor)
      : undefined;
    const records = await this.reports.listPending({
      cursor,
      take: query.limit + 1,
    });
    const hasNextPage = records.length > query.limit;
    const reports = hasNextPage ? records.slice(0, query.limit) : records;
    const lastReport = reports.at(-1);

    const items = await Promise.all(
      reports.map(async (report) => ({
        message:
          (await this.messages.findById(report.roomId, report.messageId)) ??
          null,
        report,
      })),
    );

    return {
      items,
      nextCursor:
        hasNextPage && lastReport
          ? this.cursorCodec.encode({
              createdAt: lastReport.createdAt,
              id: lastReport.id,
            })
          : null,
    };
  }

  public async dismiss(
    actor: AuthenticatedPrincipal,
    reportId: string,
  ): Promise<void> {
    const result = await this.reports.dismiss({
      actorId: actor.userId,
      dismissedAt: new Date(),
      reportId,
    });

    if (result === 'missing') {
      throw new ReportNotFoundError();
    }

    if (result === 'actioned') {
      throw new ReportAlreadyActionedError();
    }
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
