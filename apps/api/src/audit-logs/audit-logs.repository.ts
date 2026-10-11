import { Inject, Injectable } from '@nestjs/common';
import type { AuditAction } from '@livepulse/contracts';
import { Prisma } from '@livepulse/db';

import { DatabaseService } from '../database/database.service.js';
import type { AuditLogCursor } from './audit-log-cursor.js';
import { AuditLogDatabaseUnavailableError } from './audit-logs.errors.js';

const moderationAuditActions = [
  'MESSAGE_DELETED',
  'MESSAGE_REPORTED',
  'REPORT_DISMISSED',
  'ROOM_USER_MUTED',
] satisfies AuditAction[];

export interface AuditLogRecord {
  action: AuditAction;
  actorId: string;
  createdAt: Date;
  id: string;
  roomId: string | null;
  targetId: string;
}

export interface AuditLogsRepository {
  list(input: {
    cursor: AuditLogCursor | undefined;
    take: number;
  }): Promise<AuditLogRecord[]>;
}

@Injectable()
export class PrismaAuditLogsRepository implements AuditLogsRepository {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async list(input: {
    cursor: AuditLogCursor | undefined;
    take: number;
  }): Promise<AuditLogRecord[]> {
    try {
      const records = await this.database.client.auditLog.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.take,
        where: {
          action: { in: moderationAuditActions },
          ...(input.cursor
            ? {
                OR: [
                  { createdAt: { lt: input.cursor.createdAt } },
                  {
                    createdAt: input.cursor.createdAt,
                    id: { lt: input.cursor.id },
                  },
                ],
              }
            : {}),
        },
      });

      return records.map((record) => ({
        ...record,
        action: record.action as AuditAction,
      }));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientInitializationError ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P1000', 'P1001', 'P1002'].includes(error.code))
      ) {
        throw new AuditLogDatabaseUnavailableError({ cause: error });
      }

      throw error;
    }
  }
}
