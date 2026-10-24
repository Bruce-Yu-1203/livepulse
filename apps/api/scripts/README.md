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

The default room and account are the seeded live room and
`viewer@livepulse.local`. `BENCHMARK_ROOM_ID`, `BENCHMARK_EMAIL`, and
`BENCHMARK_PASSWORD` can override them. Keep connections at least as high as
messages per second because the application refills one rate-limit token per
connection each second.

`endToEndAckMs` measures from sending `message.send` until its originating
socket receives `message.created`. It includes persistence and Redis delivery.
`stageMs` measures individual operations; stage percentiles should not be
added together. `combinedProcess` includes both the API and load generator.
Because all services share one machine and all connections use one account,
these results describe a controlled local comparison rather than deployed
capacity.

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
