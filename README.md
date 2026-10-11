# LivePulse

LivePulse is a TypeScript full-stack MVP for interactive live rooms. Viewers can register, watch a demo video, join WebSocket chat and danmaku, recover message history, like rooms, and report messages. Hosts manage room lifecycle and mutes, while administrators review reports and preserve an audit trail.

## Stack

- Next.js 16 and React 19 for the web application
- NestJS 12 and Fastify for REST and WebSocket services
- PostgreSQL and Prisma for transactional data
- MongoDB for message history
- Redis Pub/Sub and leased presence for cross-instance realtime delivery
- Zod contracts shared by browser and server
- Vitest, ESLint, Prettier, and TypeScript for validation

## Prerequisites

- Node.js 24
- pnpm 11.19
- Docker with Docker Compose

Enable the pinned package manager and install dependencies:

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
```

## Run locally for development

The application has localhost-only development defaults. To override them, copy the environment template, edit it, and export its values into each terminal that starts an application process:

```bash
cp .env.example .env
set -a
. ./.env
set +a
```

Start data services, apply migrations, and seed the demo accounts:

```bash
pnpm db:up
pnpm db:migrate
DEMO_PASSWORD='choose-a-local-demo-password' pnpm db:seed
```

Start the API and web application in separate terminals:

```bash
pnpm dev:api
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000). The seeded users are:

| Role | Email |
| --- | --- |
| Viewer | `viewer@livepulse.local` |
| Host | `host@livepulse.local` |
| Administrator | `admin@livepulse.local` |

All three accounts use the `DEMO_PASSWORD` value supplied during seeding. These are local demonstration identities, not production credentials.

## Run the complete MVP with Docker Compose

Set local-only secrets, build the application images, start the stack, and seed it:

```bash
export ACCESS_TOKEN_SECRET='replace-with-a-random-secret-of-at-least-32-bytes'
export DEMO_PASSWORD='choose-a-local-demo-password'
docker compose -f infra/compose/compose.yml up --build -d --wait
docker compose -f infra/compose/compose.yml run --rm seed
```

The web application runs on port 3000 and the API/WebSocket service runs on port 3001. Stop the stack with:

```bash
docker compose -f infra/compose/compose.yml down
```

## MVP demonstration

1. Sign in as the host, open Studio, create or edit a room, and move it from draft to live.
2. Open the live room in two browser profiles. Sign in as the viewer in one and keep the host in the other.
3. Send messages from the viewer. Confirm chat history and danmaku appear in both profiles.
4. Toggle danmaku, change its density, like the room, and reload to confirm message recovery.
5. Mute the viewer as the host and confirm that new sends are rejected.
6. Report a message as the viewer, then sign in as the administrator to dismiss or remove it and inspect the audit history.
7. Send a configured prohibited term such as `scam-offer` and confirm it is rejected before persistence.

## Validation

Run the normal quality gate:

```bash
pnpm validate
```

Run database integration tests after starting PostgreSQL, MongoDB, and Redis:

```bash
DATABASE_URL='postgresql://livepulse:livepulse_dev_password@localhost:5432/livepulse?schema=public' \
MONGODB_URL='mongodb://localhost:27017/livepulse_test_manual' \
REDIS_URL='redis://localhost:6379' \
REDIS_KEY_PREFIX='livepulse-test' \
ACCESS_TOKEN_SECRET='integration-test-secret-at-least-32-bytes-long' \
WEB_ORIGIN='http://localhost:3000' \
pnpm test:db
```

The architecture and scaling path are documented in [LivePulse_Technical_Stack_EN.md](LivePulse_Technical_Stack_EN.md). Product behavior and acceptance criteria are in [LivePulse_Requirements_EN.md](LivePulse_Requirements_EN.md).
