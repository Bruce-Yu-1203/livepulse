import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { AvatarController } from './avatar.controller.js';
import { AvatarService } from './avatar.service.js';
import { BetterAuthService } from './better-auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { SessionGuard } from './session.guard.js';
import { RegistrationController } from './registration.controller.js';
import { RegistrationService } from './registration.service.js';
import { ResendVerificationEmail } from './resend-verification-email.js';

@Module({
  controllers: [AuthController, AvatarController, RegistrationController],
  exports: [BetterAuthService, CsrfGuard, SessionGuard],
  imports: [DatabaseModule],
  providers: [
    BetterAuthService,
    AvatarService,
    CsrfGuard,
    SessionGuard,
    RegistrationService,
    ResendVerificationEmail,
  ],
})
export class AuthModule {}
