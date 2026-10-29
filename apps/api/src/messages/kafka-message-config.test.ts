import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  kafkaMessageConfig,
  kafkaPipelineEnabled,
} from './kafka-message-config.js';

describe('Kafka message configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to the existing direct pipeline', () => {
    vi.stubEnv('MESSAGE_PIPELINE', undefined);
    expect(kafkaPipelineEnabled()).toBe(false);
    vi.stubEnv('MESSAGE_PIPELINE', 'kafka');
    expect(kafkaPipelineEnabled()).toBe(true);
    vi.stubEnv('MESSAGE_PIPELINE', 'unknown');
    expect(kafkaPipelineEnabled).toThrow('MESSAGE_PIPELINE');
  });

  it('requires broker addresses and complete SASL credentials', () => {
    vi.stubEnv('KAFKA_BROKERS', undefined);
    expect(kafkaMessageConfig).toThrow('KAFKA_BROKERS');
    vi.stubEnv('KAFKA_BROKERS', 'broker-a:9092, broker-b:9092');
    vi.stubEnv('KAFKA_SASL_USERNAME', 'user');
    expect(kafkaMessageConfig).toThrow('both username and password');
    vi.stubEnv('KAFKA_SASL_PASSWORD', 'password');
    vi.stubEnv('KAFKA_SASL_MECHANISM', 'scram-sha-512');
    expect(kafkaMessageConfig().topic).toBe('livepulse.messages.v1');
  });
});
