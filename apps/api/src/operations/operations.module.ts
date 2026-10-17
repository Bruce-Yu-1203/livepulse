import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { DatabaseModule } from '../database/database.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';

@Module({
  controllers: [OperationsController],
  imports: [AuthModule, DatabaseModule, RealtimeModule],
  providers: [OperationsService, RolesGuard],
})
export class OperationsModule {}
