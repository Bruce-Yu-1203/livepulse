interface RedisEnvironment {
  keyPrefix: string | undefined;
  nodeEnvironment: string | undefined;
  redisUrl: string | undefined;
}

export function resolveRedisConfiguration(environment: RedisEnvironment): {
  keyPrefix: string;
  redisUrl: string;
} {
  if (!environment.redisUrl && environment.nodeEnvironment === 'production') {
    throw new Error('REDIS_URL is required in production');
  }

  const keyPrefix = environment.keyPrefix?.trim() || 'livepulse';
  if (!/^[A-Za-z0-9:_-]{1,64}$/.test(keyPrefix)) {
    throw new Error('REDIS_KEY_PREFIX is invalid');
  }

  return {
    keyPrefix,
    redisUrl: environment.redisUrl ?? 'redis://localhost:6379',
  };
}
