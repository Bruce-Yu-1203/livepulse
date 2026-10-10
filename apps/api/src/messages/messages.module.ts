import { Module } from '@nestjs/common';

import { RoomsModule } from '../rooms/rooms.module.js';
import { MessagesController } from './messages.controller.js';
import { MongoMessagesRepository } from './messages.repository.js';
import { MessagesService } from './messages.service.js';
import {
  MESSAGES_REPOSITORY,
  REALTIME_MESSAGE_PUBLISHER,
} from './messages.tokens.js';

@Module({
  controllers: [MessagesController],
  exports: [MessagesService, REALTIME_MESSAGE_PUBLISHER],
  imports: [RoomsModule],
  providers: [
    MessagesService,
    MongoMessagesRepository,
    {
      provide: MESSAGES_REPOSITORY,
      useExisting: MongoMessagesRepository,
    },
    {
      provide: REALTIME_MESSAGE_PUBLISHER,
      useExisting: MessagesService,
    },
  ],
})
export class MessagesModule {}
