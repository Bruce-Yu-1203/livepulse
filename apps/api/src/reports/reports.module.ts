import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { MessageModerationController } from './message-moderation.controller.js';
import { ReportsController } from './reports.controller.js';
import { PrismaReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';
import { REPORTS_REPOSITORY } from './reports.tokens.js';

@Module({
  controllers: [MessageModerationController, ReportsController],
  imports: [
    AuthModule,
    DatabaseModule,
    MessagesModule,
    RealtimeModule,
    RateLimitModule,
  ],
  providers: [
    ReportsService,
    RolesGuard,
    {
      provide: REPORTS_REPOSITORY,
      useClass: PrismaReportsRepository,
    },
  ],
})
export class ReportsModule {}
