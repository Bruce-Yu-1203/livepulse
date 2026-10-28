import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RoomLifecycleModule } from '../room-lifecycle/room-lifecycle.module.js';
import { RealtimeCacheModule } from '../realtime/realtime-cache.module.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { BroadcastModule } from '../broadcast/broadcast.module.js';
import { RoomMutesController } from './room-mutes.controller.js';
import { PrismaRoomMutesRepository } from './room-mutes.repository.js';
import { RoomMutesService } from './room-mutes.service.js';
import { ROOM_MUTES_REPOSITORY } from './room-mutes.tokens.js';
import { RoomLikesController } from './room-likes.controller.js';
import { PrismaRoomLikesRepository } from './room-likes.repository.js';
import { RoomLikesService } from './room-likes.service.js';
import { ROOM_LIKES_REPOSITORY } from './room-likes.tokens.js';
import { RoomsController } from './rooms.controller.js';
import { PrismaRoomsRepository } from './rooms.repository.js';
import { RoomsService } from './rooms.service.js';
import { ROOMS_REPOSITORY } from './rooms.tokens.js';

@Module({
  controllers: [RoomsController, RoomLikesController, RoomMutesController],
  exports: [RoomsService],
  imports: [
    AuthModule,
    BroadcastModule,
    DatabaseModule,
    RoomLifecycleModule,
    RealtimeCacheModule,
  ],
  providers: [
    RoomsService,
    RoomLikesService,
    RoomMutesService,
    RolesGuard,
    {
      provide: ROOM_MUTES_REPOSITORY,
      useClass: PrismaRoomMutesRepository,
    },
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
