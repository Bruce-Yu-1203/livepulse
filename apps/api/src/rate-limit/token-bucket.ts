export interface TokenBucketPolicy {
  capacity: number;
  refillMilliseconds: number;
  ttlMilliseconds: number;
}

export const consumeTokenScript = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillMilliseconds = tonumber(ARGV[2])
local ttlMilliseconds = tonumber(ARGV[3])
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local state = redis.call('HMGET', key, 'tokens', 'updatedAt')
local tokens = tonumber(state[1]) or capacity
local updatedAt = tonumber(state[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - updatedAt) / refillMilliseconds)
local retryAfterMilliseconds = 0
if tokens >= 1 then
  tokens = tokens - 1
else
  retryAfterMilliseconds = math.ceil((1 - tokens) * refillMilliseconds)
end
redis.call('HSET', key, 'tokens', tokens, 'updatedAt', now)
redis.call('PEXPIRE', key, ttlMilliseconds)
return retryAfterMilliseconds
`;

export function consumeInMemoryToken(
  buckets: Map<string, { tokens: number; updatedAt: number }>,
  key: string,
  policy: TokenBucketPolicy,
  now = Date.now(),
): number | undefined {
  const bucket = buckets.get(key) ?? {
    tokens: policy.capacity,
    updatedAt: now,
  };
  bucket.tokens = Math.min(
    policy.capacity,
    bucket.tokens +
      Math.max(0, now - bucket.updatedAt) / policy.refillMilliseconds,
  );
  bucket.updatedAt = now;
  const retryAfterMilliseconds =
    bucket.tokens >= 1
      ? undefined
      : Math.ceil((1 - bucket.tokens) * policy.refillMilliseconds);
  if (retryAfterMilliseconds === undefined) bucket.tokens -= 1;
  buckets.set(key, bucket);
  return retryAfterMilliseconds;
}
