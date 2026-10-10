import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { RoomLikesController } from './room-likes.controller.js';
import { PrismaRoomLikesRepository } from './room-likes.repository.js';
import { RoomLikesService } from './room-likes.service.js';
import { ROOM_LIKES_REPOSITORY } from './room-likes.tokens.js';
import { RoomsController } from './rooms.controller.js';
import { PrismaRoomsRepository } from './rooms.repository.js';
import { RoomsService } from './rooms.service.js';
import { ROOMS_REPOSITORY } from './rooms.tokens.js';

@Module({
  controllers: [RoomsController, RoomLikesController],
  exports: [RoomsService],
  imports: [AuthModule, DatabaseModule],
  providers: [
    RoomsService,
    RoomLikesService,
    RolesGuard,
    {
      provide: ROOM_LIKES_REPOSITORY,
      useClass: PrismaRoomLikesRepository,
    },
    {
      provide: ROOMS_REPOSITORY,
      useClass: PrismaRoomsRepository,
    },
  ],
})
export class RoomsModule {}
