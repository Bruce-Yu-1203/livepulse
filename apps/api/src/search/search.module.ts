import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { FollowsController } from './follows.controller.js';
import { FollowsService } from './follows.service.js';
import {
  PublicUsersController,
  SearchController,
} from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  controllers: [FollowsController, PublicUsersController, SearchController],
  imports: [AuthModule, DatabaseModule, RoomsModule],
  providers: [FollowsService, SearchService],
})
export class SearchModule {}
