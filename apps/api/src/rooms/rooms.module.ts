import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { RoomsController } from './rooms.controller.js';
import { PrismaRoomsRepository } from './rooms.repository.js';
import { RoomsService } from './rooms.service.js';
import { ROOMS_REPOSITORY } from './rooms.tokens.js';

@Module({
  controllers: [RoomsController],
  exports: [RoomsService],
  imports: [AuthModule, DatabaseModule],
  providers: [
    RoomsService,
    RolesGuard,
    {
      provide: ROOMS_REPOSITORY,
      useClass: PrismaRoomsRepository,
    },
  ],
})
export class RoomsModule {}
