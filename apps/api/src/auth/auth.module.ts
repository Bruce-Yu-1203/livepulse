import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { BetterAuthService } from './better-auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { SessionGuard } from './session.guard.js';

@Module({
  controllers: [AuthController],
  exports: [BetterAuthService, CsrfGuard, SessionGuard],
  imports: [DatabaseModule],
  providers: [BetterAuthService, CsrfGuard, SessionGuard],
})
export class AuthModule {}
