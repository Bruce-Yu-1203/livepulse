import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { MessagesController } from './messages.controller.js';
import { PostgresMessagesRepository } from './messages.repository.js';
import { MessagesService } from './messages.service.js';
import { KafkaMessagePublisher } from './kafka-message-publisher.js';
import { kafkaPipelineEnabled } from './kafka-message-config.js';
import {
  MESSAGES_REPOSITORY,
  REALTIME_MESSAGE_PUBLISHER,
} from './messages.tokens.js';

@Module({
  controllers: [MessagesController],
  exports: [MessagesService, REALTIME_MESSAGE_PUBLISHER],
  imports: [DatabaseModule, RoomsModule],
  providers: [
    MessagesService,
    ...(kafkaPipelineEnabled() ? [KafkaMessagePublisher] : []),
    PostgresMessagesRepository,
    {
      provide: MESSAGES_REPOSITORY,
      useExisting: PostgresMessagesRepository,
    },
    {
      provide: REALTIME_MESSAGE_PUBLISHER,
      useExisting: kafkaPipelineEnabled()
        ? KafkaMessagePublisher
        : MessagesService,
    },
  ],
})
export class MessagesModule {}
