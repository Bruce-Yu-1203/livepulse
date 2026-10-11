import { Inject, Injectable } from '@nestjs/common';
import type { ListAuditLogsQuery } from '@livepulse/contracts';

import { AuditLogCursorCodec } from './audit-log-cursor.js';
import type {
  AuditLogRecord,
  AuditLogsRepository,
} from './audit-logs.repository.js';
import { AUDIT_LOGS_REPOSITORY } from './audit-logs.tokens.js';

@Injectable()
export class AuditLogsService {
  private readonly cursorCodec = new AuditLogCursorCodec();

  public constructor(
    @Inject(AUDIT_LOGS_REPOSITORY)
    private readonly auditLogs: AuditLogsRepository,
  ) {}

  public async list(query: ListAuditLogsQuery): Promise<{
    items: AuditLogRecord[];
    nextCursor: string | null;
  }> {
    const cursor = query.cursor
      ? this.cursorCodec.decode(query.cursor)
      : undefined;
    const records = await this.auditLogs.list({
      cursor,
      take: query.limit + 1,
    });
    const hasNextPage = records.length > query.limit;
    const items = hasNextPage ? records.slice(0, query.limit) : records;
    const lastItem = items.at(-1);

    return {
      items,
      nextCursor:
        hasNextPage && lastItem
          ? this.cursorCodec.encode({
              createdAt: lastItem.createdAt,
              id: lastItem.id,
            })
          : null,
    };
  }
}
