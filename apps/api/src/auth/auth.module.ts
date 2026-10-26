import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { AuthController } from './auth.controller.js';
import { AvatarController } from './avatar.controller.js';
import { AvatarService } from './avatar.service.js';
import { BetterAuthService } from './better-auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { SessionGuard } from './session.guard.js';
import { TurnstileVerifier } from './turnstile-verifier.js';
import { RegistrationController } from './registration.controller.js';
import { RegistrationService } from './registration.service.js';
import { ResendVerificationEmail } from './resend-verification-email.js';

@Module({
  controllers: [AuthController, AvatarController, RegistrationController],
  exports: [AvatarService, BetterAuthService, CsrfGuard, SessionGuard],
  imports: [DatabaseModule, RateLimitModule],
  providers: [
    BetterAuthService,
    AvatarService,
    CsrfGuard,
    SessionGuard,
    TurnstileVerifier,
    RegistrationService,
    ResendVerificationEmail,
  ],
})
export class AuthModule {}
