import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuditLogsController } from './audit-logs.controller.js';
import { PrismaAuditLogsRepository } from './audit-logs.repository.js';
import { AuditLogsService } from './audit-logs.service.js';
import { AUDIT_LOGS_REPOSITORY } from './audit-logs.tokens.js';

@Module({
  controllers: [AuditLogsController],
  imports: [AuthModule, DatabaseModule],
  providers: [
    AuditLogsService,
    RolesGuard,
    {
      provide: AUDIT_LOGS_REPOSITORY,
      useClass: PrismaAuditLogsRepository,
    },
  ],
})
export class AuditLogsModule {}
