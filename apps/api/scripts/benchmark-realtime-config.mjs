import { URL } from 'node:url';

const localHosts = new Set(['127.0.0.1', 'localhost']);

export function readBenchmarkConfig(environment) {
  const apiOrigin = environment.BENCHMARK_API_ORIGIN ?? 'http://127.0.0.1:3101';
  const apiOrigins = environment.BENCHMARK_API_ORIGINS
    ? environment.BENCHMARK_API_ORIGINS.split(',').map((value) => value.trim())
    : [apiOrigin];
  const databaseUrl = environment.DATABASE_URL;
  const redisUrl = environment.REDIS_URL;
  const redisKeyPrefix = environment.REDIS_KEY_PREFIX;
  const password = environment.BENCHMARK_PASSWORD ?? environment.DEMO_PASSWORD;
  const connections = positiveInteger(
    environment.BENCHMARK_CONNECTIONS,
    20,
    'BENCHMARK_CONNECTIONS',
  );
  const messagesPerSecond = positiveInteger(
    environment.BENCHMARK_MESSAGES_PER_SECOND,
    10,
    'BENCHMARK_MESSAGES_PER_SECOND',
  );
  const durationSeconds = positiveInteger(
    environment.BENCHMARK_DURATION_SECONDS,
    30,
    'BENCHMARK_DURATION_SECONDS',
  );
  const externalApi = environment.BENCHMARK_EXTERNAL_API === '1';
  const verifyDeliveries = environment.BENCHMARK_VERIFY_DELIVERIES === '1';
  const profilePid = environment.BENCHMARK_PROFILE_PID
    ? positiveInteger(
        environment.BENCHMARK_PROFILE_PID,
        1,
        'BENCHMARK_PROFILE_PID',
      )
    : null;
  const profilePids = environment.BENCHMARK_PROFILE_PIDS
    ? environment.BENCHMARK_PROFILE_PIDS.split(',').map((value) =>
        positiveInteger(value.trim(), 1, 'BENCHMARK_PROFILE_PIDS'),
      )
    : profilePid
      ? [profilePid]
      : [];
  const roomId =
    environment.BENCHMARK_ROOM_ID ?? '44444444-4444-4444-8444-444444444444';
  const roomIds = environment.BENCHMARK_ROOM_IDS
    ? environment.BENCHMARK_ROOM_IDS.split(',').map((value) => value.trim())
    : [roomId];

  if (
    environment.BENCHMARK_EXTERNAL_API &&
    !['0', '1'].includes(environment.BENCHMARK_EXTERNAL_API)
  ) {
    throw new Error('BENCHMARK_EXTERNAL_API must be 0 or 1');
  }
  if (
    environment.BENCHMARK_VERIFY_DELIVERIES &&
    !['0', '1'].includes(environment.BENCHMARK_VERIFY_DELIVERIES)
  ) {
    throw new Error('BENCHMARK_VERIFY_DELIVERIES must be 0 or 1');
  }
  if (profilePid && !externalApi) {
    throw new Error('BENCHMARK_PROFILE_PID requires BENCHMARK_EXTERNAL_API=1');
  }
  if (environment.BENCHMARK_PROFILE_PIDS && !externalApi) {
    throw new Error('BENCHMARK_PROFILE_PIDS requires BENCHMARK_EXTERNAL_API=1');
  }
  if (environment.BENCHMARK_PROFILE_PIDS && profilePid) {
    throw new Error(
      'Use either BENCHMARK_PROFILE_PID or BENCHMARK_PROFILE_PIDS',
    );
  }
  if (new Set(profilePids).size !== profilePids.length) {
    throw new Error('BENCHMARK_PROFILE_PIDS must contain unique process IDs');
  }
  if (profilePids.length > 0 && profilePids.length !== apiOrigins.length) {
    throw new Error('Profile PID count must match API origin count');
  }
  if (
    roomIds.some((value) => !value) ||
    new Set(roomIds).size !== roomIds.length
  ) {
    throw new Error('BENCHMARK_ROOM_IDS must contain unique nonempty IDs');
  }

  if (
    !databaseUrl ||
    !localUrl(databaseUrl, ['postgres:', 'postgresql:']) ||
    !new URL(databaseUrl).pathname.startsWith('/livepulse_benchmark_')
  ) {
    throw new Error(
      'DATABASE_URL must point to a local livepulse_benchmark_* database',
    );
  }
  if (
    !redisUrl ||
    !localUrl(redisUrl, ['redis:']) ||
    !redisKeyPrefix?.startsWith('livepulse-benchmark-')
  ) {
    throw new Error(
      'Redis must be local with a livepulse-benchmark-* key prefix',
    );
  }
  if (
    apiOrigins.some(
      (origin) => !localUrl(origin, ['http:']) || !new URL(origin).port,
    ) ||
    new Set(apiOrigins).size !== apiOrigins.length
  ) {
    throw new Error('API origins must be unique local HTTP origins with ports');
  }
  if (apiOrigins.length > 1 && !externalApi) {
    throw new Error('Multiple API origins require BENCHMARK_EXTERNAL_API=1');
  }
  if (!password) {
    throw new Error('DEMO_PASSWORD or BENCHMARK_PASSWORD is required');
  }
  if (messagesPerSecond > connections) {
    throw new Error(
      'Use at least one connection per message/second to avoid the per-peer rate limit',
    );
  }

  return {
    apiOrigin: apiOrigins[0],
    apiOrigins,
    webOrigin: environment.WEB_ORIGIN ?? 'http://localhost:3000',
    roomId,
    roomIds,
    email: environment.BENCHMARK_EMAIL ?? 'viewer@livepulse.local',
    password,
    connections,
    messagesPerSecond,
    durationSeconds,
    externalApi,
    verifyDeliveries,
    profilePid,
    profilePids,
  };
}

function localUrl(value, protocols) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && localHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function positiveInteger(value, fallback, name) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return number;
}
