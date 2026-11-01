# LivePulse

LivePulse is a TypeScript live-streaming app for discovering rooms, broadcasting
video, and talking with viewers in real time. Hosts stream through LiveKit;
viewers watch, chat, follow creators, and explore rooms by category. Hosts and
administrators have tools to keep the conversation safe.

[Explore the interface](#screenshots) · [Run locally](#run-locally-for-development) ·
[Architecture](#architecture-at-a-glance) · [Validation](#validation)

## What you can do

| Area | Features |
| --- | --- |
| Discover | Featured live rooms, category pages and filters, search, and a live-channel sidebar. |
| Broadcast | Private screen/camera preview, microphone controls, live chat in Studio, and a warning before leaving an active broadcast. Choose Smooth (720p), HD (1080p), or Ultra (1080p60), tune for games/video or text/slides, and monitor outgoing video health. |
| Watch and interact | LiveKit playback with Auto or available manual video-quality choices, Socket.IO chat, danmaku, follows, room likes, and message-history recovery. |
| Moderate | Host mutes, viewer reports, prohibited-content checks, administrator review, and an audit trail. |

The browser, API, and workers share TypeScript contracts. PostgreSQL is the
source of truth for accounts, rooms, moderation, and saved messages. LiveKit
carries the media stream, while Socket.IO carries room events. Redis coordinates
realtime delivery and presence across API instances. Kafka can decouple message
acceptance from broadcast and persistence when the message pipeline is enabled.

## Screenshots

### Discover live rooms

Featured streams, live channels, and category browsing on the home page.

![LivePulse home page with a featured stream and category browsing](docs/screenshots/discover.png)

### Watch and chat

A live room combines the video player, chat, and creator details. The player
also offers Auto and the quality layers published by the host.

![LivePulse room with video, live chat, and host details](docs/screenshots/watch.png)

### Prepare a broadcast

Studio lets hosts choose a screen or camera, check the local preview, and set
the room title, category, and description before going live. Stream-quality and
content presets are available below the source controls.

![LivePulse Studio preview and stream information form](docs/screenshots/studio.png)

## Architecture at a glance

```mermaid
flowchart LR
  Browser[Browser]
  Web[Next.js web app]
  API[NestJS API and Socket.IO gateway]
  Contracts[Shared Zod contracts]
  Postgres[(PostgreSQL)]
  Redis[(Redis)]
  LiveKit[LiveKit media service]
  Kafka[(Kafka topic)]
  Broadcast[Broadcast worker]
  Persistence[Persistence worker]

  Browser -->|Pages| Web
  Web -->|REST requests| API
  Browser <-->|Room events| API
  Browser <-->|Audio and video| LiveKit
  API -->|Publish and view tokens| LiveKit
  Web -.-> Contracts
  API -.-> Contracts
  API <-->|Rooms, accounts, history| Postgres
  API <-->|Presence and room events| Redis
  API -->|Kafka mode: accepted messages| Kafka
  Kafka --> Broadcast
  Kafka --> Persistence
  Broadcast -->|Fan-out| Redis
  Persistence -->|Save history| Postgres
```

The diagram shows Kafka mode, used by the complete Docker Compose stack. A
separately started API defaults to direct mode: it saves a message to PostgreSQL
before publishing the room event through Redis. Both modes use PostgreSQL for
history and LiveKit for media.

### Message path in Kafka mode

```mermaid
flowchart LR
  Sender[Sender] -->|message.send| Gateway[Socket.IO gateway]
  Gateway -->|Validate session, room, mute, content, and rate| Topic[(Kafka topic)]
  Topic -->|Acknowledged publish| Gateway
  Gateway -->|message.created acknowledgement| Sender
  Topic --> Broadcast[Broadcast worker]
  Topic --> Persistence[Persistence worker]
  Broadcast --> Redis[(Redis Pub/Sub)]
  Redis --> Gateway
  Gateway -->|message.created event| Viewers[Connected viewers]
  Persistence --> Postgres[(PostgreSQL history)]
  Postgres -->|Cursor-based recovery| History[History API]
  History --> Sender
  History --> Viewers
```

The gateway acknowledges a message after Kafka accepts it. The broadcast and
persistence workers consume it independently, so saved history may appear after
the sender's acknowledgement. Clients can recover missed messages through the
history API after reconnecting. See the [Kafka message pipeline](docs/kafka-message-pipeline.md)
for delivery guarantees and worker setup.

## Stack

- Next.js 16 and React 19 for the web application
- NestJS 12 and Fastify for REST, with Socket.IO for realtime events
- PostgreSQL and Prisma for transactional data and message history
- Redis Pub/Sub and leased presence for cross-instance realtime delivery
- Kafka and two consumer groups for optional asynchronous message delivery
- LiveKit for screen, camera, and microphone publishing and playback
- Zod contracts shared by browser and server
- Vitest, ESLint, Prettier, and TypeScript for validation

## Repository map

| Path                                       | Purpose                                                        |
| ------------------------------------------ | -------------------------------------------------------------- |
| [`apps/web`](apps/web)                     | Next.js pages, Studio, playback, chat, and admin UI            |
| [`apps/api`](apps/api)                     | REST API, authentication, Socket.IO gateway, and Kafka workers |
| [`packages/contracts`](packages/contracts) | Shared Zod schemas and event contracts                         |
| [`packages/db`](packages/db)               | Prisma schema, migrations, database client, and seed data      |
| [`infra/compose`](infra/compose)           | Local PostgreSQL, Redis, Kafka, API, worker, and web stack     |
| [`tests`](tests)                           | Repository checks and browser acceptance tests                 |

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

Create a LiveKit Cloud project and set its connection credentials before using
the browser broadcast controls. The API key and secret are server-only values;
never expose them through a `NEXT_PUBLIC_` variable:

```bash
export LIVEKIT_URL='wss://your-project.livekit.cloud'
export LIVEKIT_API_KEY='your-api-key'
export LIVEKIT_API_SECRET='your-api-secret'
```

In Studio, the host chooses a screen and/or enables a camera. The selected
sources appear in a private local preview; the broadcast button stays disabled
until every enabled video source is ready. When both sources are enabled, the
screen is the main picture and the camera is placed in the upper-right corner.
Choose a stream-quality tier and whether to prioritize motion or sharp text;
HD (1080p) and games/video are the defaults. The selected tier sets the capture
resolution, frame rate, and simulcast layers. Once live, Studio shows chat and
outgoing video statistics, and warns before navigation that would stop the
broadcast. Starting the broadcast publishes the prepared tracks. If the room
has no cover, the browser captures a frame from the main preview and saves it
as the cover.

Start the API and web application in separate terminals:

```bash
pnpm dev:api
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000). The seeded users are:

| Role          | Email                    |
| ------------- | ------------------------ |
| Viewer        | `viewer@livepulse.local` |
| Host          | `host@livepulse.local`   |
| Administrator | `admin@livepulse.local`  |

All three accounts use the `DEMO_PASSWORD` value supplied during seeding. These are local demonstration identities, not production credentials.

### Enable email registration

The API uses Redis to limit registration, sign-ins, avatar uploads, and reports.
Each endpoint has an aggregate client IP bucket. Registration emails also have
a limit of five accepted sends per email in a rolling ten-minute window. Email
sign-in requires Turnstile after ten failed attempts for one email in a rolling
ten-minute window. Avatar uploads and reports have separate per-user buckets,
so users sharing a public IP have independent personal quotas. Direct
connections use the socket IP. Behind a reverse proxy, set
`HTTP_TRUST_PROXY_CIDRS` to its actual IP addresses or CIDR ranges
(comma-separated) so Fastify resolves the original client IP. On Railway, the
API reads the platform-provided `X-Real-IP` header automatically, so no proxy
CIDR setting is needed. Leave the setting empty for direct connections.
Protected requests return `429` when their bucket is empty and `503` if Redis
is unavailable.

Create a Resend API key and verify the sender domain, then set these server-only
values before starting the API:

```bash
export RESEND_API_KEY='your-resend-api-key'
export RESEND_FROM_EMAIL='LivePulse <verify@your-verified-domain.example>'
export TURNSTILE_SECRET_KEY='your-cloudflare-turnstile-secret-key'
export NEXT_PUBLIC_TURNSTILE_SITE_KEY='your-cloudflare-turnstile-site-key'
```

Registration asks for an email, then a unique username and password, then a
Turnstile verification and six-digit email code. The browser sends the
Turnstile token with the registration request; the API validates it with
Cloudflare before creating a challenge or sending email. Turnstile tokens are
single-use, so requesting another code requires a fresh verification. Use
Cloudflare's official test keys from `.env.example` only for local development
and tests; production requires a real site key at web build time and a real
secret on the API service. Usernames use 5–30 lowercase letters, numbers, or
underscores and start with a letter. Passwords require at least eight characters
with letters and numbers. Codes expire after ten minutes and can be resent once
every 60 seconds. Verification creates the account and signs the user in. The
seeded demo accounts can still sign in without Resend; new email registration
requires both Resend values and the Turnstile keys. Add the server-only values
to the Railway API service and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the Vercel
web build for production registration.

### Store profile photos in S3

The API stores profile photos in the private `livepulse-assets-bruce-2026`
bucket in `ca-central-1`, using keys under `avatars/{userId}/avatar`. Set these
server-only values in the root `.env` for Docker Compose, or on the Railway API
service for deployment:

```bash
AWS_REGION=ca-central-1
S3_BUCKET=livepulse-assets-bruce-2026
AWS_ACCESS_KEY_ID=your-iam-access-key-id
AWS_SECRET_ACCESS_KEY=your-iam-secret-access-key
```

Use an IAM identity with only `s3:GetObject` and `s3:PutObject` on
`arn:aws:s3:::livepulse-assets-bruce-2026/avatars/*`. On AWS hosts, the SDK can
use an attached IAM role instead of access keys. Keep S3 Block Public Access on;
the API serves profile photos to browsers. No bucket CORS rule is needed for
this server-side upload path. Run the new Prisma migration before starting the
updated API. With Docker Compose, start from the repository root using
`pnpm demo:up`, which explicitly loads `.env`.

### Enable Google sign-in

Create an OAuth 2.0 **Web application** client in Google Cloud, configure its
authorized redirect URI, and export the generated credentials before starting
the API:

```text
http://localhost:3001/api/v1/auth/callback/google
```

```bash
export GOOGLE_CLIENT_ID='your-google-client-id'
export GOOGLE_CLIENT_SECRET='your-google-client-secret'
```

For production, register
`$BETTER_AUTH_URL/api/v1/auth/callback/google` instead. The redirect URI must
match Google Cloud exactly. When both variables are absent, Google sign-in is
disabled and email/password authentication remains available. A Google account
with a verified email can be linked to an existing LivePulse account with the
same email; new Google users start with the Viewer role.

When the web and API use sibling subdomains, set `AUTH_COOKIE_DOMAIN` to their
trusted shared parent domain, such as `livepulse.com`. Leave it unset for
localhost and single-host deployments. Do not scope authentication cookies to a
parent domain that contains untrusted subdomains.

## Run the complete MVP with Docker Compose

Set local-only secrets, build the application images, start the stack, and seed it:

```bash
export BETTER_AUTH_SECRET='replace-with-a-random-secret-of-at-least-32-bytes'
export BETTER_AUTH_URL='http://localhost:3001'
# Set only for trusted sibling production subdomains.
export AUTH_COOKIE_DOMAIN=''
export GOOGLE_CLIENT_ID='your-google-client-id'
export GOOGLE_CLIENT_SECRET='your-google-client-secret'
export LIVEKIT_URL='wss://your-project.livekit.cloud'
export LIVEKIT_API_KEY='your-api-key'
export LIVEKIT_API_SECRET='your-api-secret'
export DEMO_PASSWORD='choose-a-local-demo-password'
docker compose --env-file .env -f infra/compose/compose.yml up --build -d --wait
docker compose --env-file .env -f infra/compose/compose.yml run --rm seed
```

The web application runs on port 3000 and the API/WebSocket service runs on port 3001. Stop the stack with:

```bash
docker compose -f infra/compose/compose.yml down
```

## MVP demonstration

1. Sign in as the host, open Studio, enter the room details and category, choose a screen or camera, and start the broadcast after checking the private preview.
2. Open the live room in two browser profiles. Sign in as the viewer in one and keep the host in the other.
3. Send messages from the viewer. Confirm that both the viewer chat and the Studio chat receive them, and that danmaku appears over the viewer video.
4. Switch between Auto and the published video-quality choices, toggle danmaku, change its density, like the room, and reload to confirm message recovery.
5. Mute the viewer as the host and confirm that new sends are rejected.
6. Report a message as the viewer, then sign in as the administrator to dismiss or remove it and inspect the audit history.
7. Send a configured prohibited term such as `scam-offer` and confirm it is rejected before persistence.

## Validation

Run the normal quality gate:

```bash
pnpm validate
```

Kafka message ingestion, the two worker services, and Railway deployment are described in [Kafka message pipeline](docs/kafka-message-pipeline.md).

Run database integration tests against a dedicated disposable database after
starting PostgreSQL and Redis. Never point this suite at a database containing
development or production data because it truncates fixtures between tests.

```bash
docker compose -f infra/compose/compose.yml exec postgres \
  createdb -U livepulse livepulse_test
DATABASE_URL='postgresql://livepulse:livepulse_dev_password@localhost:5432/livepulse_test?schema=public' \
  pnpm --filter @livepulse/db exec prisma migrate deploy --config prisma7.config.ts
DATABASE_URL='postgresql://livepulse:livepulse_dev_password@localhost:5432/livepulse_test?schema=public' \
REDIS_URL='redis://localhost:6379' \
REDIS_KEY_PREFIX='livepulse-test' \
BETTER_AUTH_SECRET='integration-test-secret-at-least-32-bytes-long' \
WEB_ORIGIN='http://localhost:3000' \
pnpm test:db
```

Install the Playwright Chromium browser once, then run the isolated browser acceptance flow:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

The end-to-end command builds a dedicated Docker Compose stack, creates random runtime-only secrets, seeds its disposable data volumes, exercises separate viewer, host, and administrator browser sessions, and removes the complete stack afterward. Ports 3000, 3001, 5432, and 6379 must be available while it runs.

## CI and deployment

The [CI workflow](.github/workflows/ci.yml) runs for pull requests targeting
`main`, commits pushed to `main`, and merge queue commits. Its three jobs run
independently:

- `Quality and build` runs `pnpm validate` (lint, formatting, type checks,
  unit/component tests, and production builds).
- `PostgreSQL and Redis integration` starts disposable database services,
  applies Prisma migrations, and runs `pnpm test:db`.
- `Browser end-to-end` starts the isolated Docker Compose stack through
  `pnpm test:e2e` and saves Playwright reports when it fails.

Require all three GitHub Actions checks before merging into `main`. Keep Vercel
and Railway connected to the `main` branch for production deployments. Enable
Railway's **Wait for CI** setting on the API service so a failing `main` check
prevents its deployment. The Railway API service must continue to run Prisma
`migrate deploy` as its pre-deploy command and check `/health/ready` before it
receives traffic. CI uses temporary databases; it does not run its integration
or browser tests against the production database.

Vercel should keep `apps/web` as its root directory, include source files
outside that directory for `packages/contracts`, and provide the production
values of `API_ORIGIN` and `NEXT_PUBLIC_SOCKET_IO_URL`. Railway should use the
repository root as its build directory and keep its existing PostgreSQL,
Redis, authentication, and LiveKit variables in the API service. No production
credentials are needed in GitHub Actions for these checks.

The architecture and scaling path are documented in [LivePulse_Technical_Architecture_EN.md](LivePulse_Technical_Architecture_EN.md). Product behavior and acceptance criteria are in [LivePulse_Requirements_EN.md](LivePulse_Requirements_EN.md).
