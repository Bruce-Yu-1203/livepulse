import 'reflect-metadata';

import { createApp } from './create-app.js';

const defaultPort = 3001;
const port = Number.parseInt(process.env.PORT ?? String(defaultPort), 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const app = await createApp();

await app.listen(port, '0.0.0.0');
