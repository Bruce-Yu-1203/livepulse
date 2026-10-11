import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { ReportsController } from './reports.controller.js';
import { PrismaReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';
import { REPORTS_REPOSITORY } from './reports.tokens.js';

@Module({
  controllers: [ReportsController],
  imports: [AuthModule, DatabaseModule, MessagesModule],
  providers: [
    ReportsService,
    {
      provide: REPORTS_REPOSITORY,
      useClass: PrismaReportsRepository,
    },
  ],
})
export class ReportsModule {}
