import { Module } from '@nestjs/common';

import { DatabaseService } from './database.service.js';

@Module({
  exports: [DatabaseService],
  providers: [DatabaseService],
})
export class DatabaseModule {}
