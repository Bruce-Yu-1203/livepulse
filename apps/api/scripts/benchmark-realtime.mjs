import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';
import { io } from 'socket.io-client';

import { BetterAuthService } from '../dist/auth/better-auth.service.js';
import { createApp } from '../dist/create-app.js';
import { MESSAGES_REPOSITORY } from '../dist/messages/messages.tokens.js';
import {
  REALTIME_EVENT_BUS,
  REALTIME_ROOM_SOURCE,
} from '../dist/realtime/realtime.tokens.js';
import { readBenchmarkConfig } from './benchmark-realtime-config.mjs';

const {
  apiOrigin,
  webOrigin,
  roomId,
  email,
  password,
  connections,
  messagesPerSecond,
  durationSeconds,
  externalApi,
  profilePid,
} = readBenchmarkConfig(process.env);

const app = externalApi ? null : await createApp({ logger: false });
const samples = new Map([
  ['sessionCheckMs', []],
  ['roomLiveCheckMs', []],
  ['muteCheckMs', []],
  ['postgresInsertMs', []],
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
    app.get(REALTIME_EVENT_BUS),
    'publish',
    'redisMessagePublishMs',
    (event) => event?.type === 'message.created',
  );
}

const sockets = [];
const pendingByMessage = new Map();
const pendingByRequest = new Map();
const latencies = [];
const errors = {};
let failures = 0;
let acceptedDuringWindow = 0;
let windowEnd = 0;
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
  if (result.ok) {
    latencies.push(result.latencyMs);
    if (performance.now() <= windowEnd) acceptedDuringWindow += 1;
  } else {
    failures += 1;
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

async function main() {
  const apiUrl = new URL(apiOrigin);
  if (app) await app.listen(Number(apiUrl.port), apiUrl.hostname);
  const login = await globalThis.fetch(
    `${apiOrigin}/api/v1/auth/sign-in/email`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: webOrigin },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!login.ok)
    throw new Error(`Local benchmark login failed (${login.status})`);
  const cookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith('livepulse.session_token='))
    ?.split(';', 1)[0];
  if (!cookie)
    throw new Error('Local benchmark login did not return a session cookie');

  for (let index = 0; index < connections; index += 1) {
    const socket = io(apiOrigin, {
      extraHeaders: { cookie, origin: webOrigin },
      reconnection: false,
      transports: ['websocket'],
    });
    const connected = waitFor(socket, 'connect');
    socket.on('message.created', (event) => {
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
    await connected;
    const joined = waitFor(socket, 'room.joined');
    socket.emit('room.join', {
      payload: { roomId },
      requestId: randomUUID(),
      type: 'room.join',
      v: 1,
    });
    await joined;
  }

  // Warm the database and event path once per connection before collecting samples.
  await Promise.all(
    sockets.map(
      (socket) =>
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
              roomId,
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
  const intervalMs = 1_000 / messagesPerSecond;
  const cpuStart = process.cpuUsage();
  const rssStart = process.memoryUsage().rss;
  eventLoopDelay.enable();
  collecting = true;
  if (profilePid) process.kill(profilePid, 'SIGUSR1');
  const startedAt = performance.now();
  windowEnd = startedAt + durationSeconds * 1_000;

  for (let index = 0; index < count; index += 1) {
    const targetTime = startedAt + index * intervalMs;
    const waitMs = targetTime - performance.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const senderIndex = index % sockets.length;
    const socket = sockets[senderIndex];
    const clientMessageId = randomUUID();
    const requestId = randomUUID();
    const entry = {
      clientMessageId,
      requestId,
      senderIndex,
      sentAt: performance.now(),
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
    socket.emit('message.send', {
      payload: {
        clientMessageId,
        roomId,
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
  const finishedAt = performance.now();
  collecting = false;
  eventLoopDelay.disable();
  if (profilePid) process.kill(profilePid, 'SIGUSR2');
  const cpu = process.cpuUsage(cpuStart);
  const rssEnd = process.memoryUsage().rss;
  const stageSummaries = Object.fromEntries(
    [...samples].map(([name, values]) => [name, summary(values)]),
  );
  const result = {
    workload: 'local-authenticated-socketio-message-roundtrip-v1',
    target: 'isolated local PostgreSQL + Redis',
    settings: {
      connections,
      messagesPerSecond,
      durationSeconds,
      plannedMessages: count,
      roomId,
    },
    acceptedMessages: latencies.length,
    acceptedDuringWindow,
    acceptedPerSecond: Number(
      (acceptedDuringWindow / durationSeconds).toFixed(2),
    ),
    failures,
    errorCounts: errors,
    endToEndAckMs: summary(latencies),
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
