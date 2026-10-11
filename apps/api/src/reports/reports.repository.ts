import { Inject, Injectable } from '@nestjs/common';
import type { ReportReason } from '@livepulse/contracts';
import { Prisma } from '@livepulse/db';

import { DatabaseService } from '../database/database.service.js';
import {
  ReportDatabaseUnavailableError,
  ReportMessageNotFoundError,
} from './reports.errors.js';

export interface ReportRecord {
  createdAt: Date;
  details: string | null;
  id: string;
  messageId: string;
  reason: ReportReason;
  reporterId: string;
  roomId: string;
  status: 'ACTIONED' | 'DISMISSED' | 'PENDING';
}

export interface CreateReportRecord {
  details?: string;
  messageId: string;
  reason: ReportReason;
  reporterId: string;
  roomId: string;
}

export interface ReportsRepository {
  create(input: CreateReportRecord): Promise<ReportRecord>;
  listPending(take: number): Promise<ReportRecord[]>;
  recordDeletion(input: {
    actorId: string;
    deletedAt: Date;
    messageId: string;
    roomId: string;
  }): Promise<void>;
}

@Injectable()
export class PrismaReportsRepository implements ReportsRepository {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async create(input: CreateReportRecord): Promise<ReportRecord> {
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const existing = await transaction.report.findUnique({
          where: {
            reporterId_messageId: {
              messageId: input.messageId,
              reporterId: input.reporterId,
            },
          },
        });

        if (existing) {
          return existing;
        }

        const report = await transaction.report.create({
          data: {
            details: input.details ?? null,
            messageId: input.messageId,
            reason: input.reason,
            reporterId: input.reporterId,
            roomId: input.roomId,
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'MESSAGE_REPORTED',
            actorId: input.reporterId,
            createdAt: report.createdAt,
            roomId: input.roomId,
            targetId: input.messageId,
          },
        });

        return report;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.findConcurrentReport(input, error);
      }

      throwReportDatabaseError(error);
    }
  }

  public async listPending(take: number): Promise<ReportRecord[]> {
    try {
      return await this.database.client.report.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take,
        where: { status: 'PENDING' },
      });
    } catch (error) {
      throwReportDatabaseError(error);
    }
  }

  public async recordDeletion(input: {
    actorId: string;
    deletedAt: Date;
    messageId: string;
    roomId: string;
  }): Promise<void> {
    try {
      await this.database.client.$transaction([
        this.database.client.report.updateMany({
          data: { status: 'ACTIONED' },
          where: {
            messageId: input.messageId,
            roomId: input.roomId,
            status: 'PENDING',
          },
        }),
        this.database.client.auditLog.create({
          data: {
            action: 'MESSAGE_DELETED',
            actorId: input.actorId,
            createdAt: input.deletedAt,
            roomId: input.roomId,
            targetId: input.messageId,
          },
        }),
      ]);
    } catch (error) {
      throwReportDatabaseError(error);
    }
  }

  private async findConcurrentReport(
    input: CreateReportRecord,
    cause: unknown,
  ): Promise<ReportRecord> {
    try {
      const existing = await this.database.client.report.findUnique({
        where: {
          reporterId_messageId: {
            messageId: input.messageId,
            reporterId: input.reporterId,
          },
        },
      });

      if (existing) {
        return existing;
      }
    } catch (error) {
      throwReportDatabaseError(error);
    }

    throw cause;
  }
}

function throwReportDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  ) {
    throw new ReportMessageNotFoundError({ cause: error });
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P1000', 'P1001', 'P1002'].includes(error.code))
  ) {
    throw new ReportDatabaseUnavailableError({ cause: error });
  }

  throw error;
}
