# Local realtime benchmark

This benchmark starts the compiled API and its Socket.IO load generator in one
Node.js process. It uses an isolated local PostgreSQL database and Redis key
prefix. The script rejects remote services and database names outside
`livepulse_benchmark_*`.

Prepare an isolated database once from the repository root:

```sh
pnpm db:up
docker compose -f infra/compose/compose.yml exec -T postgres \
  psql -U livepulse -d postgres -c 'CREATE DATABASE livepulse_benchmark_local'
benchmark_database_url='postgresql://livepulse:livepulse_dev_password@127.0.0.1:5432/livepulse_benchmark_local?schema=public'
DATABASE_URL="$benchmark_database_url" pnpm --filter @livepulse/db exec \
  prisma migrate deploy --config prisma7.config.ts
DATABASE_URL="$benchmark_database_url" node --env-file=.env \
  packages/db/prisma/seed.mjs
pnpm build
```

The seed reads `DEMO_PASSWORD` from the root `.env` file. If the database
already exists, skip the `CREATE DATABASE` command.

From the repository root, run:

```sh
DATABASE_URL='postgresql://livepulse:livepulse_dev_password@127.0.0.1:5432/livepulse_benchmark_local?schema=public' \
REDIS_URL='redis://127.0.0.1:6379' \
REDIS_KEY_PREFIX='livepulse-benchmark-local' \
BETTER_AUTH_URL='http://localhost:3101' \
BENCHMARK_CONNECTIONS=200 \
BENCHMARK_MESSAGES_PER_SECOND=200 \
BENCHMARK_DURATION_SECONDS=30 \
pnpm --filter @livepulse/api benchmark:realtime
```

The default room and source account are the seeded live room and
`viewer@livepulse.local`. `BENCHMARK_ROOM_ID`, `BENCHMARK_EMAIL`, and
`BENCHMARK_PASSWORD` can override them. The generator creates one distinct
viewer per connection in the isolated benchmark database, using the source
account's password hash, and signs each viewer in before measurement. Keep
connections at least as high as messages per second so each viewer sends at
most one message per second after warm-up.

The benchmark API skips only the HTTP sign-in IP limit while preparing test
sessions. The realtime per-user message rate limit remains active during the
measurement window.

`endToEndAckMs` measures from sending `message.send` until its originating
socket receives `message.created`. It includes persistence and Redis delivery.
`stageMs` measures individual operations; stage percentiles should not be
added together. `combinedProcess` includes both the API and load generator.
Because all services share one machine, these results describe a controlled
local comparison rather than deployed capacity. Historical reports generated
before Redis message limiting used a single account and are not directly
comparable with the distinct-user workload.

## Separate API and load generator

At higher loads, run the API and generator in separate Node.js processes. The
server prints its PID after it is ready. The generator sends it signals to start
profiling after socket warm-up and stop profiling after all responses settle.
Save each process's JSON output to a separate file.

For a two-process sustained load, start two copies of
`benchmark-realtime-server.mjs` with the same isolated database and Redis key
prefix. Give each copy a different `BENCHMARK_API_ORIGIN`, such as local ports
3101 and 3102. Set `BENCHMARK_EXTERNAL_API=1`,
`BENCHMARK_API_ORIGINS=http://127.0.0.1:3101,http://127.0.0.1:3102`, and
`BENCHMARK_PROFILE_PIDS=FIRST_PID,SECOND_PID` on the generator. Set
`BENCHMARK_CONNECTIONS=400`, `BENCHMARK_MESSAGES_PER_SECOND=400`, and
`BENCHMARK_DURATION_SECONDS=60` to distribute 200 clients and about 200
messages/second to each API process. The generator reports per-API ACK results,
10-second ACK windows, and dispatch lag so a busy generator is visible. Use
`BENCHMARK_VERIFY_DELIVERIES=1` in a separate diagnostic run to check every
recipient and checks every message index for duplicates or missing deliveries;
counting deliveries adds client work to the latency measurement.

In one terminal, start the profiled API with the same isolated database and
Redis environment shown above:

```sh
DATABASE_URL='postgresql://livepulse:livepulse_dev_password@127.0.0.1:5432/livepulse_benchmark_local?schema=public' \
REDIS_URL='redis://127.0.0.1:6379' \
REDIS_KEY_PREFIX='livepulse-benchmark-local' \
BETTER_AUTH_URL='http://localhost:3101' \
node --env-file=.env apps/api/scripts/benchmark-realtime-server.mjs > /tmp/livepulse-api-profile.json
```

In another terminal, replace `SERVER_PID` with the PID printed by the server:

```sh
DATABASE_URL='postgresql://livepulse:livepulse_dev_password@127.0.0.1:5432/livepulse_benchmark_local?schema=public' \
REDIS_URL='redis://127.0.0.1:6379' \
REDIS_KEY_PREFIX='livepulse-benchmark-local' \
BETTER_AUTH_URL='http://localhost:3101' \
BENCHMARK_EXTERNAL_API=1 \
BENCHMARK_PROFILE_PID=SERVER_PID \
BENCHMARK_CONNECTIONS=400 \
BENCHMARK_MESSAGES_PER_SECOND=400 \
BENCHMARK_DURATION_SECONDS=30 \
node --env-file=.env apps/api/scripts/benchmark-realtime.mjs > /tmp/livepulse-generator-profile.json
```

The generator records the time from `message.send` to `message.created` on the
originating socket. The API records session validation, room and mute checks,
Redis rate limiting, PostgreSQL insertion, Redis publication, message handling,
local fanout, CPU, and event loop delay. These stages can overlap, so their
percentiles cannot be summed to reconstruct ACK latency. A long ACK with short
server stages can indicate time spent waiting before the handler starts or
after fanout begins.

For a fanout comparison, `BENCHMARK_ROOM_IDS` accepts a comma-separated list
of already-live room IDs in the isolated benchmark database. Connections are
assigned round-robin to those rooms, while the aggregate message rate stays
the same. Each sender must still use its joined room.

The production API now uses Socket.IO room broadcast for `message.created`.
The earlier per-peer baseline and benchmark-only room comparison are recorded
in `benchmark-results/local-broadcast-comparison-2026-10-24/`.

To verify cross-process delivery, start two compiled API processes on local
ports 3101 and 3102 with the same isolated benchmark database and Redis key
prefix. Run `node --env-file=.env apps/api/scripts/verify-realtime-processes.mjs`
with `BENCHMARK_API_ORIGIN=http://127.0.0.1:3101` and
`BENCHMARK_SECOND_API_ORIGIN=http://127.0.0.1:3102`. The verifier logs in,
joins clients on both processes, and checks one delivery per joined client,
none to an unjoined client, none after leaving, and one after reconnecting.
It exits with an error if any check fails.
Set `BENCHMARK_VERIFY_DELIVERIES=1` on the load generator for a diagnostic run.
It counts `message.created` events on every connected client for measurement
messages, then waits up to 15 seconds for delivery to finish. Compare
`deliveryVerification.received` with `expected`; for 400 connections, one
room, and 12,000 messages, the expected count is 4,800,000. This extra client
work affects timing, so use runs without this flag for latency comparisons.

## Initial local profile (2026-10-23)

These runs were collected before changing the realtime message path. Each used
a 30-second measurement window. The API, PostgreSQL, Redis, and load generator
shared one machine.

| Connections |         Target rate | Accepted | Failed |  ACK p95 |  ACK p99 |
| ----------: | ------------------: | -------: | -----: | -------: | -------: |
|          20 |  10 messages/second |      300 |      0 | 21.25 ms | 27.92 ms |
|          50 |  50 messages/second |    1,500 |      0 | 16.25 ms | 18.81 ms |
|         100 | 100 messages/second |    3,000 |      0 |  9.49 ms | 12.26 ms |
|         200 | 200 messages/second |    6,000 |      0 |  9.69 ms | 15.53 ms |

A 20-connection run targeting 50 messages per second was limited by the
application's per-connection rate limiter and is excluded from this table.
These initial measurements show no saturation through 200 messages per second;
they do not identify a production bottleneck or establish an optimization gain.
