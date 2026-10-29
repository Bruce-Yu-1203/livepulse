import { runKafkaMessageWorker } from './kafka-message-worker.js';

runKafkaMessageWorker('persistence').catch((error: unknown) => {
  console.error('Persistence worker failed', error);
  process.exitCode = 1;
});
