import console from 'node:console';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import process from 'node:process';
import { URL } from 'node:url';

import { BetterAuthService } from '../dist/auth/better-auth.service.js';
import { createApp } from '../dist/create-app.js';
import { DatabaseService } from '../dist/database/database.service.js';
import { MESSAGES_REPOSITORY } from '../dist/messages/messages.tokens.js';
import { HttpRateLimiter } from '../dist/rate-limit/http-rate-limiter.js';
import { RoomRealtimeHub } from '../dist/realtime/room-realtime-hub.js';
import { RealtimeMetricsService } from '../dist/realtime/realtime-metrics.service.js';
import {
  REALTIME_EVENT_BUS,
  REALTIME_RATE_LIMITER,
  REALTIME_ROOM_SOURCE,
} from '../dist/realtime/realtime.tokens.js';
import { readBenchmarkConfig } from './benchmark-realtime-config.mjs';
import { bypassBenchmarkSignInIpLimit } from './benchmark-realtime-login.mjs';
import {
  readPostgresStatementSnapshot,
  summarizePostgresStatementDelta,
} from './benchmark-realtime-postgres.mjs';
import {
  createStageProfiler,
  waitForExclusiveSignal,
} from './benchmark-realtime-profiler.mjs';
import { markProfileReady } from './benchmark-realtime-ready.mjs';

const { apiOrigin } = readBenchmarkConfig(process.env);
const postgresStatementsEnabled =
  process.env.BENCHMARK_POSTGRES_STATEMENTS === '1';
const profileReadyFile = process.env.BENCHMARK_PROFILE_READY_FILE;
if (postgresStatementsEnabled && !profileReadyFile) {
  throw new Error(
    'BENCHMARK_POSTGRES_STATEMENTS requires BENCHMARK_PROFILE_READY_FILE',
  );
}
const profiler = createStageProfiler();
const app = await createApp({ logger: false });
bypassBenchmarkSignInIpLimit(app.get(HttpRateLimiter));

profiler.wrap(
  app.get(BetterAuthService),
  'sessionPrincipalFromHeaders',
  'sessionCheckMs',
);
const roomSource = app.get(REALTIME_ROOM_SOURCE);
profiler.wrap(roomSource, 'isLive', 'roomLiveCheckMs');
profiler.wrap(roomSource, 'findActiveMuteExpiry', 'muteCheckMs');
profiler.wrap(app.get(MESSAGES_REPOSITORY), 'create', 'postgresInsertMs');
profiler.wrap(
  app.get(REALTIME_RATE_LIMITER),
  'consumeMessageToken',
  'redisRateLimitMs',
);
profiler.wrap(
  app.get(REALTIME_EVENT_BUS),
  'publish',
  'redisMessagePublishMs',
  (event) => event?.type === 'message.created',
);
const hub = app.get(RoomRealtimeHub);
profiler.wrap(
  hub,
  'handle',
  'hubHandleMs',
  (_peer, event) => event?.type === 'message.send',
);
profiler.wrapSync(
  hub,
  'broadcastLocal',
  'localBroadcastMs',
  (event) => event?.type === 'message.created',
);

const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
const origin = new URL(apiOrigin);
await app.listen(Number(origin.port), origin.hostname);
console.error(`Benchmark API ready: pid=${process.pid}`);

await new Promise((resolve) => process.once('SIGUSR1', resolve));
const database = postgresStatementsEnabled
  ? app.get(DatabaseService).client
  : undefined;
const statementBefore = database
  ? await readPostgresStatementSnapshot(database)
  : undefined;
const cpuStart = process.cpuUsage();
const rssStart = process.memoryUsage().rss;
const startedAt = performance.now();
eventLoopDelay.enable();
profiler.start();
if (profileReadyFile) await markProfileReady(profileReadyFile, process.pid);

// Nest's shutdown hook re-raises SIGUSR2, so reserve it for benchmark reporting.
await waitForExclusiveSignal(process, 'SIGUSR2');
profiler.stop();
const statementAfter = database
  ? await readPostgresStatementSnapshot(database)
  : undefined;
eventLoopDelay.disable();
const durationSeconds = Number(
  ((performance.now() - startedAt) / 1_000).toFixed(2),
);
const cpu = process.cpuUsage(cpuStart);
const rssEnd = process.memoryUsage().rss;

console.log(
  JSON.stringify(
    {
      workload: 'local-realtime-api-profile-v2',
      broadcastMode: 'socketio-room',
      durationSeconds,
      stageMs: profiler.snapshot(),
      cacheMetrics: app.get(RealtimeMetricsService).snapshot(),
      ...(statementBefore && statementAfter
        ? {
            postgresStatements: summarizePostgresStatementDelta(
              statementBefore,
              statementAfter,
            ),
          }
        : {}),
      apiProcess: {
        cpuUserMs: Number((cpu.user / 1_000).toFixed(2)),
        cpuSystemMs: Number((cpu.system / 1_000).toFixed(2)),
        rssStartMiB: Number((rssStart / 1024 / 1024).toFixed(2)),
        rssEndMiB: Number((rssEnd / 1024 / 1024).toFixed(2)),
        eventLoopDelayP95Ms: Number(
          (eventLoopDelay.percentile(95) / 1e6).toFixed(2),
        ),
        eventLoopDelayMaxMs: Number((eventLoopDelay.max / 1e6).toFixed(2)),
      },
    },
    null,
    2,
  ),
);

await app.close();
