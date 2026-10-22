import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { BetterAuthService } from './better-auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { SessionGuard } from './session.guard.js';
import { RegistrationController } from './registration.controller.js';
import { RegistrationService } from './registration.service.js';
import { ResendVerificationEmail } from './resend-verification-email.js';

@Module({
  controllers: [AuthController, RegistrationController],
  exports: [BetterAuthService, CsrfGuard, SessionGuard],
  imports: [DatabaseModule],
  providers: [
    BetterAuthService,
    CsrfGuard,
    SessionGuard,
    RegistrationService,
    ResendVerificationEmail,
  ],
})
export class AuthModule {}
