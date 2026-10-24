import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
import { io } from 'socket.io-client';

import { readBenchmarkConfig } from './benchmark-realtime-config.mjs';
import { secondLocalApiOrigin } from './verify-realtime-processes-config.mjs';

const config = readBenchmarkConfig(process.env);
const secondApiOrigin = secondLocalApiOrigin(
  config.apiOrigin,
  process.env.BENCHMARK_SECOND_API_ORIGIN ?? 'http://127.0.0.1:3102',
);

const sockets = [];
const messageCounts = new Map();

function waitFor(socket, type, predicate = () => true, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      socket.off(type, receive);
      reject(new Error(`${type} timeout`));
    }, timeoutMs);
    const receive = (event) => {
      if (!predicate(event)) return;
      globalThis.clearTimeout(timeout);
      socket.off(type, receive);
      resolve(event);
    };
    socket.on(type, receive);
  });
}

async function connect(origin, cookie) {
  const socket = io(origin, {
    extraHeaders: { cookie, origin: config.webOrigin },
    reconnection: false,
    transports: ['websocket'],
  });
  sockets.push(socket);
  await waitFor(socket, 'connect');
  const counts = new Map();
  messageCounts.set(socket, counts);
  socket.on('message.created', (event) => {
    const id = event?.payload?.clientMessageId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return socket;
}

async function join(socket) {
  const joined = waitFor(socket, 'room.joined');
  socket.emit('room.join', {
    payload: { roomId: config.roomId },
    requestId: randomUUID(),
    type: 'room.join',
    v: 1,
  });
  await joined;
}

async function sendAndCheck(sender, receivers, nonreceivers, text) {
  const clientMessageId = randomUUID();
  const delivered = receivers.map((socket) =>
    waitFor(
      socket,
      'message.created',
      (event) => event?.payload?.clientMessageId === clientMessageId,
    ),
  );
  sender.emit('message.send', {
    payload: { clientMessageId, roomId: config.roomId, text },
    requestId: randomUUID(),
    type: 'message.send',
    v: 1,
  });
  await Promise.all(delivered);
  await setTimeout(200);
  for (const socket of receivers) {
    assert.equal(messageCounts.get(socket).get(clientMessageId), 1);
  }
  for (const socket of nonreceivers) {
    assert.equal(messageCounts.get(socket).get(clientMessageId) ?? 0, 0);
  }
  return clientMessageId;
}

try {
  const login = await globalThis.fetch(
    `${config.apiOrigin}/api/v1/auth/sign-in/email`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: config.webOrigin,
      },
      body: JSON.stringify({ email: config.email, password: config.password }),
    },
  );
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith('livepulse.session_token='))
    ?.split(';', 1)[0];
  assert.ok(cookie);

  const sender = await connect(config.apiOrigin, cookie);
  const remote = await connect(secondApiOrigin, cookie);
  const unjoined = await connect(secondApiOrigin, cookie);
  await join(sender);
  await join(remote);
  const firstId = await sendAndCheck(
    sender,
    [sender, remote],
    [unjoined],
    'Across processes',
  );

  const left = waitFor(
    sender,
    'room.stats',
    (event) =>
      event?.payload?.roomId === config.roomId &&
      event?.payload?.connections === 1,
  );
  remote.emit('room.leave', {
    payload: { roomId: config.roomId },
    requestId: randomUUID(),
    type: 'room.leave',
    v: 1,
  });
  await left;
  const secondId = await sendAndCheck(
    sender,
    [sender],
    [remote, unjoined],
    'After remote leave',
  );

  remote.disconnect();
  const replacement = await connect(secondApiOrigin, cookie);
  await join(replacement);
  const thirdId = await sendAndCheck(
    sender,
    [sender, replacement],
    [unjoined],
    'After remote reconnect',
  );

  console.log(
    JSON.stringify(
      {
        workload: 'local-two-api-process-room-delivery-v1',
        apiOrigins: [config.apiOrigin, secondApiOrigin],
        roomId: config.roomId,
        checks: {
          crossProcess: firstId,
          afterLeave: secondId,
          afterReconnect: thirdId,
          unauthorizedReceipts: 0,
          duplicateReceipts: 0,
        },
        passed: true,
      },
      null,
      2,
    ),
  );
} finally {
  for (const socket of sockets) socket.disconnect();
}
