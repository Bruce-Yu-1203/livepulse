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

## Parallel validation comparison (2026-10-23)

Each run used 200 authenticated connections, 200 messages per second, and a
30-second measurement window. The original handler queried room status and
mute status sequentially; the updated handler starts both reads together.

| Handler  | Run | Accepted | Failed |  ACK p95 |  ACK p99 |
| -------- | --: | -------: | -----: | -------: | -------: |
| Original |   1 |    6,000 |      0 |  9.69 ms | 15.53 ms |
| Updated  |   1 |    6,000 |      0 |  9.42 ms | 12.95 ms |
| Original |   2 |    6,000 |      0 | 11.55 ms | 30.51 ms |
| Updated  |   2 |    6,000 |      0 |  8.86 ms | 11.58 ms |

The two-run mean of ACK p95 was 10.62 ms before and 9.14 ms after the change,
about 14% lower locally. More repetitions and a staging run are needed before
using that percentage as a general performance claim.
