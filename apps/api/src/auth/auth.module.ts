import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { PASSWORD_HASHER, USERS_REPOSITORY } from './auth.tokens.js';
import { ScryptPasswordHasher } from './password-hasher.js';
import { RegistrationService } from './registration.service.js';
import { PrismaUsersRepository } from './users.repository.js';

@Module({
  controllers: [AuthController],
  imports: [DatabaseModule],
  providers: [
    RegistrationService,
    {
      provide: PASSWORD_HASHER,
      useClass: ScryptPasswordHasher,
    },
    {
      provide: USERS_REPOSITORY,
      useClass: PrismaUsersRepository,
    },
  ],
})
export class AuthModule {}
