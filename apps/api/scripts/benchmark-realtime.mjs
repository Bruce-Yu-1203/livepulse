import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';
import { io } from 'socket.io-client';
import { createDatabaseClient } from '@livepulse/db';

import { BetterAuthService } from '../dist/auth/better-auth.service.js';
import { createApp } from '../dist/create-app.js';
import { MESSAGES_REPOSITORY } from '../dist/messages/messages.tokens.js';
import { HttpRateLimiter } from '../dist/rate-limit/http-rate-limiter.js';
import {
  REALTIME_EVENT_BUS,
  REALTIME_RATE_LIMITER,
  REALTIME_ROOM_SOURCE,
} from '../dist/realtime/realtime.tokens.js';
import { readBenchmarkConfig } from './benchmark-realtime-config.mjs';
import { createDeliveryVerifier } from './benchmark-realtime-deliveries.mjs';
import { bypassBenchmarkSignInIpLimit } from './benchmark-realtime-login.mjs';
import {
  clearProfileReady,
  waitForProfileReady,
} from './benchmark-realtime-ready.mjs';
import { prepareBenchmarkViewers } from './benchmark-realtime-users.mjs';

const {
  apiOrigin,
  apiOrigins,
  webOrigin,
  roomId,
  roomIds,
  email,
  password,
  connections,
  messagesPerSecond,
  durationSeconds,
  externalApi,
  profilePids,
  verifyDeliveries,
} = readBenchmarkConfig(process.env);

const app = externalApi ? null : await createApp({ logger: false });
const profileReadyFile = process.env.BENCHMARK_PROFILE_READY_FILE;
if (profileReadyFile && profilePids.length === 0) {
  throw new Error('BENCHMARK_PROFILE_READY_FILE requires profiled API PIDs');
}
if (app) bypassBenchmarkSignInIpLimit(app.get(HttpRateLimiter));
const samples = new Map([
  ['sessionCheckMs', []],
  ['roomLiveCheckMs', []],
  ['muteCheckMs', []],
  ['postgresInsertMs', []],
  ['redisRateLimitMs', []],
  ['redisMessagePublishMs', []],
]);
let collecting = false;

function timeMethod(target, methodName, sampleName, predicate = () => true) {
  const original = target[methodName].bind(target);
  target[methodName] = async (...args) => {
    const shouldRecord = collecting && predicate(...args);
    const startedAt = performance.now();
    try {
      return await original(...args);
    } finally {
      if (shouldRecord)
        samples.get(sampleName).push(performance.now() - startedAt);
    }
  };
}

if (app) {
  timeMethod(
    app.get(BetterAuthService),
    'principalFromHeaders',
    'sessionCheckMs',
  );
  const roomSource = app.get(REALTIME_ROOM_SOURCE);
  timeMethod(roomSource, 'isLive', 'roomLiveCheckMs');
  timeMethod(roomSource, 'findActiveMuteExpiry', 'muteCheckMs');
  timeMethod(app.get(MESSAGES_REPOSITORY), 'create', 'postgresInsertMs');
  timeMethod(
    app.get(REALTIME_RATE_LIMITER),
    'consumeMessageToken',
    'redisRateLimitMs',
  );
  timeMethod(
    app.get(REALTIME_EVENT_BUS),
    'publish',
    'redisMessagePublishMs',
    (event) => event?.type === 'message.created',
  );
}

const sockets = [];
const roomBySocket = [];
const originBySocket = [];
const byApiOrigin = new Map(
  apiOrigins.map((origin) => [
    origin,
    {
      connections: 0,
      plannedMessages: 0,
      acceptedMessages: 0,
      acceptedDuringWindow: 0,
      failures: 0,
      latencies: [],
    },
  ]),
);
const pendingByMessage = new Map();
const pendingByRequest = new Map();
const latencies = [];
const errors = {};
let failures = 0;
let acceptedDuringWindow = 0;
let windowEnd = 0;
let deliveryVerifier;
let tenSecondWindows;
const dispatchLags = [];
let sentDuringWindow = 0;
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });

function waitFor(socket, eventName, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${eventName} timeout`)),
      timeoutMs,
    );
    socket.once(eventName, (value) => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
}

function settle(entry, result) {
  if (entry.done) return;
  entry.done = true;
  clearTimeout(entry.timeout);
  pendingByMessage.delete(entry.clientMessageId);
  pendingByRequest.delete(entry.requestId);
  const origin = byApiOrigin.get(entry.origin);
  const window = tenSecondWindows[entry.windowIndex];
  if (result.ok) {
    latencies.push(result.latencyMs);
    origin.acceptedMessages += 1;
    origin.latencies.push(result.latencyMs);
    window.acceptedMessages += 1;
    window.latencies.push(result.latencyMs);
    if (performance.now() <= windowEnd) {
      acceptedDuringWindow += 1;
      origin.acceptedDuringWindow += 1;
    }
  } else {
    failures += 1;
    origin.failures += 1;
    window.failures += 1;
    errors[result.code ?? 'unknown'] =
      (errors[result.code ?? 'unknown'] ?? 0) + 1;
  }
  entry.resolve(result);
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return Number(
    ordered[
      Math.min(ordered.length - 1, Math.ceil(p * ordered.length) - 1)
    ].toFixed(2),
  );
}

function summary(values) {
  return {
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length ? Number(Math.max(...values).toFixed(2)) : null,
  };
}

async function loginBenchmarkViewer(origin, viewerEmail) {
  const response = await globalThis.fetch(
    `${origin}/api/v1/auth/sign-in/email`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: webOrigin },
      body: JSON.stringify({ email: viewerEmail, password }),
    },
  );
  if (!response.ok) {
    throw new Error(`Local benchmark login failed (${response.status})`);
  }
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('livepulse.session_token='))
    ?.split(';', 1)[0];
  if (!cookie) {
    throw new Error('Local benchmark login did not return a session cookie');
  }
  return cookie;
}

async function main() {
  const apiUrl = new URL(apiOrigin);
  if (app) await app.listen(Number(apiUrl.port), apiUrl.hostname);
  const database = createDatabaseClient(process.env.DATABASE_URL);
  let viewerEmails;
  try {
    viewerEmails = await prepareBenchmarkViewers(database, email, connections);
  } finally {
    await database.$disconnect();
  }
  const cookies = [];
  for (let index = 0; index < connections; index += 8) {
    const batch = viewerEmails.slice(index, index + 8);
    cookies.push(
      ...(await Promise.all(
        batch.map((viewerEmail, offset) =>
          loginBenchmarkViewer(
            apiOrigins[(index + offset) % apiOrigins.length],
            viewerEmail,
          ),
        ),
      )),
    );
  }

  for (let index = 0; index < connections; index += 1) {
    const socketRoomId = roomIds[index % roomIds.length];
    const socketOrigin = apiOrigins[index % apiOrigins.length];
    const socket = io(socketOrigin, {
      extraHeaders: { cookie: cookies[index], origin: webOrigin },
      reconnection: false,
      transports: ['websocket'],
    });
    const connected = waitFor(socket, 'connect');
    socket.on('message.created', (event) => {
      deliveryVerifier?.record(index, event);
      const entry = pendingByMessage.get(event?.payload?.clientMessageId);
      if (entry?.senderIndex === index) {
        settle(entry, {
          ok: true,
          latencyMs: performance.now() - entry.sentAt,
        });
      }
    });
    socket.on('error', (event) => {
      const entry = pendingByRequest.get(event?.requestId);
      if (entry) settle(entry, { ok: false, code: event?.payload?.code });
    });
    sockets.push(socket);
    roomBySocket.push(socketRoomId);
    originBySocket.push(socketOrigin);
    byApiOrigin.get(socketOrigin).connections += 1;
    await connected;
    const joined = waitFor(socket, 'room.joined');
    socket.emit('room.join', {
      payload: { roomId: socketRoomId },
      requestId: randomUUID(),
      type: 'room.join',
      v: 1,
    });
    await joined;
  }

  // Warm the database and event path once per connection before collecting samples.
  await Promise.all(
    sockets.map(
      (socket, index) =>
        new Promise((resolve, reject) => {
          const clientMessageId = randomUUID();
          const requestId = randomUUID();
          const timeout = setTimeout(
            () => reject(new Error('Warm-up message timeout')),
            10_000,
          );
          const receive = (event) => {
            if (event?.payload?.clientMessageId !== clientMessageId) return;
            clearTimeout(timeout);
            socket.off('message.created', receive);
            resolve();
          };
          socket.on('message.created', receive);
          socket.emit('message.send', {
            payload: {
              clientMessageId,
              roomId: roomBySocket[index],
              text: 'Local benchmark warm-up',
            },
            requestId,
            type: 'message.send',
            v: 1,
          });
        }),
    ),
  );

  const count = messagesPerSecond * durationSeconds;
  tenSecondWindows = Array.from(
    { length: Math.ceil(durationSeconds / 10) },
    () => ({
      sentMessages: 0,
      acceptedMessages: 0,
      failures: 0,
      latencies: [],
    }),
  );
  if (verifyDeliveries) {
    deliveryVerifier = createDeliveryVerifier(roomBySocket, count);
  }
  const intervalMs = 1_000 / messagesPerSecond;
  const cpuStart = process.cpuUsage();
  const rssStart = process.memoryUsage().rss;
  eventLoopDelay.enable();
  collecting = true;
  if (profileReadyFile) await clearProfileReady(profileReadyFile, profilePids);
  for (const pid of profilePids) process.kill(pid, 'SIGUSR1');
  if (profileReadyFile)
    await waitForProfileReady(profileReadyFile, profilePids);
  const startedAt = performance.now();
  windowEnd = startedAt + durationSeconds * 1_000;

  for (let index = 0; index < count; index += 1) {
    const targetTime = startedAt + index * intervalMs;
    const waitMs = targetTime - performance.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const senderIndex = index % sockets.length;
    const socket = sockets[senderIndex];
    const origin = originBySocket[senderIndex];
    const clientMessageId = randomUUID();
    const requestId = randomUUID();
    const sentAt = performance.now();
    const windowIndex = Math.min(
      tenSecondWindows.length - 1,
      Math.max(0, Math.floor((sentAt - startedAt) / 10_000)),
    );
    dispatchLags.push(Math.max(0, sentAt - targetTime));
    if (sentAt <= windowEnd) sentDuringWindow += 1;
    tenSecondWindows[windowIndex].sentMessages += 1;
    byApiOrigin.get(origin).plannedMessages += 1;
    const entry = {
      clientMessageId,
      requestId,
      senderIndex,
      origin,
      sentAt,
      windowIndex,
      done: false,
      resolve: () => {},
    };
    const response = new Promise((resolve) => {
      entry.resolve = resolve;
    });
    entry.timeout = setTimeout(
      () => settle(entry, { ok: false, code: 'ack_timeout' }),
      10_000,
    );
    pendingByMessage.set(clientMessageId, entry);
    pendingByRequest.set(requestId, entry);
    deliveryVerifier?.recordSent(index, sentAt);
    socket.emit('message.send', {
      payload: {
        clientMessageId,
        roomId: roomBySocket[senderIndex],
        text: `Local benchmark message ${index}`,
      },
      requestId,
      type: 'message.send',
      v: 1,
    });
    entry.response = response;
  }

  await Promise.all(
    [...pendingByMessage.values()].map((entry) => entry.response),
  );
  const remainingWindowMs = windowEnd - performance.now();
  if (remainingWindowMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingWindowMs));
  }
  const deliveryVerification = await deliveryVerifier?.finish();
  const finishedAt = performance.now();
  collecting = false;
  eventLoopDelay.disable();
  for (const pid of profilePids) process.kill(pid, 'SIGUSR2');
  const cpu = process.cpuUsage(cpuStart);
  const rssEnd = process.memoryUsage().rss;
  const stageSummaries = Object.fromEntries(
    [...samples].map(([name, values]) => [name, summary(values)]),
  );
  const result = {
    workload: 'local-authenticated-socketio-message-roundtrip-v2',
    target: 'isolated local PostgreSQL + Redis',
    settings: {
      connections,
      distinctUsers: viewerEmails.length,
      messagesPerSecond,
      durationSeconds,
      plannedMessages: count,
      roomId,
      roomIds,
      apiOrigins,
      connectionsPerApi: Object.fromEntries(
        [...byApiOrigin].map(([origin, stats]) => [origin, stats.connections]),
      ),
    },
    sentDuringWindow,
    acceptedMessages: latencies.length,
    acceptedDuringWindow,
    acceptedPerSecond: Number(
      (acceptedDuringWindow / durationSeconds).toFixed(2),
    ),
    failures,
    errorCounts: errors,
    endToEndAckMs: summary(latencies),
    dispatchLagMs: summary(dispatchLags),
    tenSecondWindows: tenSecondWindows.map((window, index) => ({
      fromSecond: index * 10,
      toSecond: Math.min((index + 1) * 10, durationSeconds),
      sentMessages: window.sentMessages,
      acceptedMessages: window.acceptedMessages,
      failures: window.failures,
      endToEndAckMs: summary(window.latencies),
    })),
    ...(apiOrigins.length > 1
      ? {
          byApiOrigin: Object.fromEntries(
            [...byApiOrigin].map(([origin, stats]) => [
              origin,
              {
                connections: stats.connections,
                plannedMessages: stats.plannedMessages,
                acceptedMessages: stats.acceptedMessages,
                acceptedDuringWindow: stats.acceptedDuringWindow,
                failures: stats.failures,
                endToEndAckMs: summary(stats.latencies),
              },
            ]),
          ),
        }
      : {}),
    ...(deliveryVerification ? { deliveryVerification } : {}),
    ...(app ? { stageMs: stageSummaries } : {}),
    [app ? 'combinedProcess' : 'generatorProcess']: {
      cpuUserMs: Number((cpu.user / 1_000).toFixed(2)),
      cpuSystemMs: Number((cpu.system / 1_000).toFixed(2)),
      rssStartMiB: Number((rssStart / 1024 / 1024).toFixed(2)),
      rssEndMiB: Number((rssEnd / 1024 / 1024).toFixed(2)),
      eventLoopDelayP95Ms: Number(
        (eventLoopDelay.percentile(95) / 1e6).toFixed(2),
      ),
      eventLoopDelayMaxMs: Number((eventLoopDelay.max / 1e6).toFixed(2)),
    },
    durationObservedSeconds: Number(
      ((finishedAt - startedAt) / 1_000).toFixed(2),
    ),
  };
  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} finally {
  for (const socket of sockets) socket.disconnect();
  if (app) await app.close();
}
