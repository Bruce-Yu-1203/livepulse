import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const developmentDatabaseUrl =
  'postgresql://livepulse:livepulse_dev_password@localhost:5432/livepulse?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? developmentDatabaseUrl,
  },
});
