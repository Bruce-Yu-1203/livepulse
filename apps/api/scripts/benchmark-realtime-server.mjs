import console from 'node:console';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import process from 'node:process';
import { URL } from 'node:url';

import { BetterAuthService } from '../dist/auth/better-auth.service.js';
import { createApp } from '../dist/create-app.js';
import { MESSAGES_REPOSITORY } from '../dist/messages/messages.tokens.js';
import { RoomRealtimeHub } from '../dist/realtime/room-realtime-hub.js';
import {
  REALTIME_EVENT_BUS,
  REALTIME_ROOM_SOURCE,
} from '../dist/realtime/realtime.tokens.js';
import { readBenchmarkConfig } from './benchmark-realtime-config.mjs';
import { createStageProfiler } from './benchmark-realtime-profiler.mjs';

const { apiOrigin } = readBenchmarkConfig(process.env);
const profiler = createStageProfiler();
const app = await createApp({ logger: false });

profiler.wrap(
  app.get(BetterAuthService),
  'principalFromHeaders',
  'sessionCheckMs',
);
const roomSource = app.get(REALTIME_ROOM_SOURCE);
profiler.wrap(roomSource, 'isLive', 'roomLiveCheckMs');
profiler.wrap(roomSource, 'findActiveMuteExpiry', 'muteCheckMs');
profiler.wrap(app.get(MESSAGES_REPOSITORY), 'create', 'postgresInsertMs');
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
const cpuStart = process.cpuUsage();
const rssStart = process.memoryUsage().rss;
const startedAt = performance.now();
eventLoopDelay.enable();
profiler.start();

await new Promise((resolve) => process.once('SIGUSR2', resolve));
profiler.stop();
eventLoopDelay.disable();
const durationSeconds = Number(
  ((performance.now() - startedAt) / 1_000).toFixed(2),
);
const cpu = process.cpuUsage(cpuStart);
const rssEnd = process.memoryUsage().rss;

console.log(
  JSON.stringify(
    {
      workload: 'local-realtime-api-profile-v1',
      durationSeconds,
      stageMs: profiler.snapshot(),
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
