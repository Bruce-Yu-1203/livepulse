import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthTokenService } from './auth-token.service.js';
import {
  PASSWORD_HASHER,
  SESSIONS_REPOSITORY,
  USERS_REPOSITORY,
} from './auth.tokens.js';
import { ScryptPasswordHasher } from './password-hasher.js';
import { CsrfGuard } from './csrf.guard.js';
import { RegistrationService } from './registration.service.js';
import { PrismaSessionsRepository } from './sessions.repository.js';
import { SessionService } from './session.service.js';
import { PrismaUsersRepository } from './users.repository.js';

@Module({
  controllers: [AuthController],
  imports: [DatabaseModule],
  providers: [
    RegistrationService,
    SessionService,
    AuthTokenService,
    AccessTokenGuard,
    CsrfGuard,
    {
      provide: PASSWORD_HASHER,
      useClass: ScryptPasswordHasher,
    },
    {
      provide: SESSIONS_REPOSITORY,
      useClass: PrismaSessionsRepository,
    },
    {
      provide: USERS_REPOSITORY,
      useClass: PrismaUsersRepository,
    },
  ],
  exports: [AccessTokenGuard, AuthTokenService, CsrfGuard],
})
export class AuthModule {}
