import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { createDatabaseClient } from '@livepulse/db';
import type { DatabaseClient } from '@livepulse/db';

const developmentDatabaseUrl =
  'postgresql://livepulse:livepulse_dev_password@localhost:5432/livepulse?schema=public';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  public readonly client: DatabaseClient;

  public constructor() {
    this.client = createDatabaseClient(
      resolveDatabaseUrl({
        databaseUrl: process.env.DATABASE_URL,
        nodeEnvironment: process.env.NODE_ENV,
      }),
    );
  }

  public async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

interface DatabaseEnvironment {
  databaseUrl: string | undefined;
  nodeEnvironment: string | undefined;
}

export function resolveDatabaseUrl(environment: DatabaseEnvironment): string {
  if (environment.databaseUrl) {
    return environment.databaseUrl;
  }

  if (environment.nodeEnvironment === 'production') {
    throw new Error('DATABASE_URL is required in production');
  }

  return developmentDatabaseUrl;
}
