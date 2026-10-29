import { runKafkaMessageWorker } from './kafka-message-worker.js';

runKafkaMessageWorker('broadcast').catch((error: unknown) => {
  console.error('Broadcast worker failed', error);
  process.exitCode = 1;
});
