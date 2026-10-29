import { Kafka, logLevel } from 'kafkajs';

export interface KafkaMessageConfig {
  topic: string;
  broadcastGroup: string;
  persistenceGroup: string;
  kafka: Kafka;
}

export function kafkaPipelineEnabled(): boolean {
  const pipeline = process.env.MESSAGE_PIPELINE || 'direct';
  if (pipeline !== 'direct' && pipeline !== 'kafka') {
    throw new Error('MESSAGE_PIPELINE must be direct or kafka');
  }
  return pipeline === 'kafka';
}

export function kafkaMessageConfig(): KafkaMessageConfig {
  const brokers = process.env.KAFKA_BROKERS?.split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);
  if (!brokers?.length) {
    throw new Error('KAFKA_BROKERS is required for the Kafka message pipeline');
  }

  const mechanism = process.env.KAFKA_SASL_MECHANISM;
  const username = process.env.KAFKA_SASL_USERNAME;
  const password = process.env.KAFKA_SASL_PASSWORD;
  if ((username || password || mechanism) && !(username && password)) {
    throw new Error('Kafka SASL requires both username and password');
  }
  if (
    mechanism &&
    !['plain', 'scram-sha-256', 'scram-sha-512'].includes(mechanism)
  ) {
    throw new Error('KAFKA_SASL_MECHANISM is invalid');
  }
  const sasl =
    username && password
      ? mechanism === 'scram-sha-256'
        ? { mechanism: 'scram-sha-256' as const, username, password }
        : mechanism === 'scram-sha-512'
          ? { mechanism: 'scram-sha-512' as const, username, password }
          : { mechanism: 'plain' as const, username, password }
      : undefined;

  return {
    broadcastGroup:
      process.env.KAFKA_BROADCAST_GROUP || 'livepulse-broadcast-v1',
    persistenceGroup:
      process.env.KAFKA_PERSISTENCE_GROUP || 'livepulse-persist-v1',
    topic: process.env.KAFKA_MESSAGES_TOPIC || 'livepulse.messages.v1',
    kafka: new Kafka({
      brokers,
      clientId: process.env.KAFKA_CLIENT_ID || 'livepulse-api',
      logLevel: logLevel.ERROR,
      ...(process.env.KAFKA_SSL === 'true' ? { ssl: true } : {}),
      ...(sasl ? { sasl } : {}),
    }),
  };
}
