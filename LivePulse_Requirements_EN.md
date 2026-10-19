# LivePulse — Product Requirements Document (PRD)

**Version:** 2.0 · **Date:** October 18, 2026
**Status:** Proposed target architecture and acceptance criteria; not a claim of implemented features
**Companion:** `LivePulse_Technical_Architecture_EN.md`

## 1. Product vision and scope

LivePulse is a portfolio-grade live-event interaction platform. Visitors browse public rooms and watch a licensed/demo video; authenticated viewers post real-time chat/danmaku, like a room, inspect recent history, and report abuse. Hosts create/manage rooms and moderate participants. Administrators investigate reports and maintain audit trails. The principal engineering demonstrations are reliable event ingestion, cross-replica WebSocket fan-out, transient Redis read models, asynchronous PostgreSQL persistence, security, repeatable cloud deployment, load testing, and failure recovery.

**In scope:** room management, email authentication, Google OAuth sign-in, session security, custom RBAC, live interaction, cursor-paginated history, one-like-per-user state, online user/connection estimates, moderation, secure room cover uploads, administration, CI/CD, instrumentation, and distributed test scenarios.

**Out of scope for v2 core:** payment settlement/gifts, proprietary video ingest/transcoding, multi-region active-active operation, Kubernetes production cluster, large-scale recommendations, and guarantees that each individual browser receives every live frame. `LIVE` refers to an open interaction session, not a video-streaming origin. A demonstration video must have appropriate usage rights. Danmaku follows the current interaction session and need not be synchronized to a video playback timeline.

Targets below are **design goals only** and require reproducible verification before appearing as achievements on a résumé.

## 2. Target deployment and ownership

| Concern                            | Platform / system                             | Responsibility                                                                                      |
| ---------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Web app and frontend CDN           | Vercel                                        | Next.js App Router, responsive interface, SSR, static assets, preview deployments                   |
| API and WebSocket gateways         | Railway                                       | NestJS REST and Socket.IO or native WS gateway; multiple replicas in a later phase                  |
| Workers                            | Railway                                       | Kafka broadcast and PostgreSQL persistence consumers; event-outbox publisher                        |
| Transactional and message database | Railway PostgreSQL                            | Identity/auth tables, rooms, likes, reports, audit, danmaku history, outbox                         |
| Ephemeral shared state             | Railway Redis                                 | Gateway Pub/Sub, rate limits, connection/user presence, like-count read model, optional event cache |
| Streaming broker                   | Managed Kafka or separately hosted broker     | Bounded durable ingestion buffer and distinct consumer groups                                       |
| Object storage                     | AWS S3                                        | Private cover-image uploads, object validation, approved image assets                               |
| Background workflow                | Inngest (optional P1)                         | Image processing, notifications, retries; **not** per-danmaku orchestration                         |
| Automation                         | GitHub Actions / platform integrations        | CI checks, staged release, deploy, smoke tests                                                      |
| Telemetry                          | Pino + Sentry + OpenTelemetry / Grafana Cloud | Structured errors, traces, metrics, alerts                                                          |

**CDN boundary:** Vercel CDN serves the Next.js application and its applicable cached assets. It is **not automatically a general-purpose CDN for objects stored in S3**. Approved public assets can initially be served via controlled URLs or a Next.js image pipeline; a dedicated S3-facing CDN is an optional later decision. Cloudflare, CloudFront, EKS, and EC2 are not required in the target release.

## 3. Roles and authorization

| Role   | Rights                                                                | Denials                                                                |
| ------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Guest  | Browse visible rooms and read public history / demo video             | Cannot send, like, report as an authenticated account, or create rooms |
| Viewer | Send danmaku, like/unlike, read history, report content               | Subject to rate limits, bans/mutes and room status                     |
| Host   | Create, edit and end **owned** rooms; mute users in owned rooms       | Cannot modify another host's room                                      |
| Admin  | Review reports, remove content, manage users, view operations summary | All sensitive actions audited                                          |

Use Better Auth for authentication/session management and application-owned NestJS Guards/Services for RBAC and **resource ownership**. Never trust UI-hidden controls, unverified socket payload user IDs, or roles supplied by clients. Choose one consistent session model rather than mixing Better Auth sessions with legacy refresh-token routes.

## 4. Milestones, with explicit exit gates

| Phase                            | Product outcome                                                                                                               | Exit gate                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **M0 — Local vertical slice**    | Single NestJS instance; Next.js; Better Auth; rooms; native Socket.IO room broadcast; PostgreSQL history/likes; local Compose | Two browsers join, send, see history, like, and pass permission checks                                      |
| **M1 — Durable danmaku**         | Kafka accepted-message boundary, PostgreSQL persistence worker, dedupe, retry/recovery, moderation tombstones                 | Kafka ACK precedes `accepted`; replay doesn't duplicate history; consumer crash/restart tested              |
| **M2 — Distributed interaction** | Railway 2–3 Gateway replicas, Redis Pub/Sub/Socket.IO Redis Adapter, global presence and limiters, derived like counters      | Users assigned to different replicas communicate; gateway failure recovers; metrics demonstrate correctness |
| **M3 — Cloud & security**        | Vercel web, Railway API/PG/Redis/worker, managed Kafka, S3 safe upload, HTTPS, CI/CD, telemetry, backups                      | Public URL works, upload is authorized, protected releases and rollback drill succeed                       |
| **M4 — Enhancements (optional)** | Inngest workflows, advanced alerting, larger load tests, cost optimizations                                                   | Results documented with actual measured numbers and architecture tradeoffs                                  |

Do not implement MongoDB and PostgreSQL message histories in parallel. For a greenfield v2 implementation, PostgreSQL owns messages from the first slice. If migrating existing MongoDB records, do a separate measured migration with a cutover and validation plan; never silently switch a running production data source.

## 5. Functional requirements

### FR01 — Authentication and sessions

- Email/password signup, login, logout, persisted login across refresh; secure password hashing as supported by Better Auth.
- Google OAuth sign-in through Better Auth. A verified Google identity may link to an existing account with the same normalized email; new social accounts start as viewers.
- Server validates sessions on HTTP operations **and on Socket.IO connection/join/message operations**; disconnected/revoked sessions cannot continue sending.
- Host and admin permissions enforced server-side; room ownership checked in Services.
- Use HTTPS, HttpOnly/Secure cookies, suitable SameSite and Origin/CORS/CSRF policy for `app.livepulse.com` and `api.livepulse.com`.
- Acceptance: anonymous send blocked; viewer gets 403 on admin actions; logout invalidates protected operations; no credentials in logs.

### FR02 — Rooms and lifecycle

- Room fields: ID, host, title, description, cover asset ID, demo video URL, visibility, creation timestamps, optimistic-lock version.
- Lifecycle: `DRAFT -> LIVE -> ENDED`; ended rooms become read-only, and cannot accept new danmaku or likes if product policy disables likes after end (define and test explicitly).
- Room lists use cursor pagination; non-visible drafts must not leak; stale host updates return conflict.
- Acceptance: another host cannot modify a room; concurrent updates do not silently overwrite; new messages rejected when ENDED.

### FR03 — Danmaku, live chat and acknowledgment

- Text length 1–200 Unicode characters; capped inbound payload (initial target: 4 KiB); server performs schema/size checks, normalization, profanity filter, mute and rate checks.
- Every attempt includes stable `clientMessageId`; server creates stable `messageId` and captures `roomId`, authenticated `userId`, server acceptance time, payload hash.
- States: `pending`, `accepted`, `failed`; **accepted means Kafka acknowledged append**, not that PostgreSQL or every viewer has completed delivery.
- Target path: gateway -> Kafka `danmaku.messages.v1`; separate `broadcast-v1` consumer -> Redis Pub/Sub -> all gateways -> local room sockets; `history-v1` consumer -> batched PostgreSQL transaction.
- Client deduplicates optimistic and incoming messages by stable ID and preserves the original retry ID. ACK timeout indicates _unknown_, not definite failure.
- Acceptance: viewer B sees A's message; no duplicate on A after echo; Kafka failure returns explicit failure/timeout, not false acceptance.

### FR04 — Connection, join, leave and recovery

- One browser tab normally maintains one Socket.IO connection and joins/leaves logical rooms; a new room does not necessarily open another connection.
- Gateway authenticates handshake/session, validates room access, acknowledges subscription readiness; reconnect with exponential backoff and jitter.
- On reconnect, obtain a history snapshot with a cursor, merge buffered live events, dedupe by message ID, and refresh presence/like counts.
- Socket.IO uses **WebSocket-only transport** for replicated Railway gateways unless a compatible sticky-session strategy is explicitly deployed. Long-polling fallback is not promised.
- Acceptance: simulated 10-second interruption reconnects without full reload; terminated gateway causes rejoin; history eventually reconciles missed real-time events.

### FR05 — Message history, retention and moderation tombstones

- PostgreSQL is authoritative for saved history, separate from ephemeral Redis Pub/Sub. Default 50 messages/page, max 100, keyset pagination under a deterministic order with tie breaker.
- Initial retention target seven days; expiration/partition strategy must be documented, tested and compliant with desired moderation/report retention.
- Duplicate consumed events are harmless (unique `messageId` and `(roomId,userId,clientMessageId)`); deletion retains a tombstone that older replays cannot restore.
- Acceptance: no cross-room leakage, no duplicate pages, replay cannot overwrite a deleted message, bounded pagination under high data volume.

### FR06 — Likes and unlike

- A viewer can have at most one active like per room. The PostgreSQL `room_likes(room_id,user_id)` unique constraint and transaction are authoritative.
- PUT/DELETE operations are idempotent. Redis stores a **derived room like-count read model** and may serve fast reads/broadcast counts; asynchronous invalidation/refresh follows committed SQL.
- Avoid treating `Redis INCR` by itself as an authoritative unique-like count; support count rebuild after cache loss.
- Acceptance: concurrent repeated likes count once; unlike works; derived count converges to SQL after recovery (target within five seconds in normal operation).

### FR07 — Presence / online population

- Store short-lived connection leases in Redis, distinguish **connections** from **unique authenticated users**. Multiple tabs count as multiple connections but one signed-in user.
- Initial heartbeat 15 s, expiry 45 s, stats publish every 5 s; after gateway crash clean up leases automatically (target convergence within ~60 s).
- Display online users as an **estimate** rather than a strong-consistency counter. Handle reconnects and stale connections.
- Acceptance: two tabs count as two connections but one user; a killed gateway does not leave infinite ghost users.

### FR08 — Rate limiting, abuse and slow consumers

- Redis-backed atomic token bucket or equivalent, scoped per user and room: initial target 1 message/s average with burst up to 5; add IP and connection limits.
- Fail-safe behavior when Redis unavailable: reject sends or apply clearly documented stricter local policy; don't silently disable protections.
- Bound each WebSocket client's send buffer and coalesce replaceable statistics; close sustained slow consumers with reconnect guidance.
- Acceptance: spammer throttled without impairing others; overloaded clients do not cause unbounded memory; abuse and dropped delivery metrics visible.

### FR09 — Content moderation and reports

- Host mute/unmute for their own room; admin deletes prohibited messages; user reports with audit trail and authorization.
- PostgreSQL stores mute scope/expiry, report status, audit actor/timestamp and deleted-message tombstones. Redis mute cache optional; consistency/invalidation must be explicit.
- Real-time `message.deleted` events invalidate connected UIs; reconnect/history always reapply deletion.
- Text is rendered as plain text, never untrusted HTML. Acceptance: mute applies across gateway replicas; audit history is durable; old events do not resurrect content.

### FR10 — S3 media upload

- Host requests upload authorization; API verifies role/ownership and issues a short-lived presigned URL restricted to a randomized object key, expected type and allowable size by an enforceable upload method/policy.
- Browser sends bytes directly to a **private S3 quarantine prefix/bucket**; API confirms object and verifies size/content signature, optionally malware scans and re-encodes images before marking ready.
- Only approved assets may be attached to rooms or served to viewers. Unused uploads expire; bucket blocks public access by default; IAM follows least privilege.
- Acceptance: unauthenticated and cross-room uploads denied; oversized/invalid files rejected and not served; keys/credentials never exposed beyond the limited presign capability.

### FR11 — Background jobs, operations and deployment

- Low-frequency image processing/notification can use Inngest with step retries and idempotency. Kafka remains responsible for high-volume danmaku; do not create one Inngest function run per message.
- CI checks lint, types, unit/integration/E2E tests and builds before production deployment; apply Prisma migrations in a controlled step; smoke tests and rollback guide required.
- Operators can see request errors, Kafka lag, persistence rate, Redis health, reconnects, active connections and S3 upload failures. Application secrets are never logged.
- Acceptance: failed build never silently deploys; failure dashboard shows actionable signals; database backup and restore are rehearsed.

## 6. UI pages and UX states

| Page            | Essential content                                                         | States to design                                                     |
| --------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Sign up / login | Forms, field errors, session                                              | loading / rejected / authenticated                                   |
| Room directory  | Cover, host, status, online estimate, search                              | loading / empty / error                                              |
| Room detail     | Licensed demo video, danmaku overlay, chat panel, like, presence, history | connecting / ready / reconnecting / message pending / failed / ended |
| Host console    | Room CRUD, upload status, lifecycle, mutes                                | unauthorized / conflict / uploading / scanning / ready               |
| Admin console   | Reports, deletions, audit logs, ops summary                               | pending / confirmed / conflict / forbidden                           |

The client keeps bounded recent messages, uses virtualized lists for long history, caps active danmaku animations, supports mobile layouts and accessible reduced-motion preferences.

## 7. API and realtime contracts (proposed)

**HTTP (NestJS):** `GET /api/v1/rooms`; `GET /api/v1/rooms/:id`; `POST /api/v1/rooms`; `PATCH /api/v1/rooms/:id`; `GET /api/v1/rooms/:id/messages?cursor=...`; `PUT/DELETE /api/v1/rooms/:id/likes/me`; `POST /api/v1/uploads/presign`; `POST /api/v1/uploads/:id/complete`; `POST /api/v1/reports`; host mute endpoints; admin moderation endpoints; `/health/live`, `/health/ready`. Better Auth's mounted endpoints remain under the auth integration namespace and should not be duplicated by a legacy custom token API.

**Socket.IO events:** client: `room.join`, `room.leave`, `message.send`; server: `room.joined`, `message.accepted`, `message.created`, `message.deleted`, `room.stats`, `room.ended`, `error`. Share payload schemas in `packages/contracts`; version incompatible envelope changes.

Example `message.send` payload:

```json
{
  "roomId": "room_123",
  "clientMessageId": "client_uuid",
  "text": "What a show!"
}
```

Example `message.accepted` payload:

```json
{
  "roomId": "room_123",
  "clientMessageId": "client_uuid",
  "messageId": "msg_server_id",
  "status": "accepted"
}
```

Each API error includes a stable `code` and `requestId`; HTTP mutating operations never rely on frontend-only validation.

## 8. Nonfunctional goals and verification

| Test               | Setup and duration                                        | Target (not yet measured)                                                    |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Idle connections   | 1,000 connected sockets over 10 minutes                   | Unexpected disconnect <1%; bounded memory                                    |
| Steady mixed rooms | 1,000 connections / 10 rooms / 100 inbound msg/s / 10 min | Kafka accepted P95 <300 ms; observer P95 <500 ms                             |
| Hot room           | 1,000 in one room / 20 inbound msg/s / 5 min              | Log ~20,000 theoretical downstream deliveries/s, actual receipt and drops    |
| Burst              | 1,000 across 10 rooms / 500 inbound msg/s / 30 s          | Bounded lag and queues; accepted messages persist after catch-up             |
| Worker restart     | Stop persistence consumer for 30 s                        | No duplicate rows on replay; recovery within documented retention/lag window |
| Gateway restart    | Terminate one of 3 replicas                               | Clients reconnect and rejoin; presence stale entries expire                  |
| Redis failure      | Interrupt Pub/Sub/presence/limit service                  | Degraded status explicit; no false claim of live delivery                    |
| PostgreSQL outage  | Temporarily stop history writes                           | Consumer offsets do not skip uncommitted records; Kafka lag observable       |
| S3 abuse tests     | Wrong type, oversized file, wrong owner                   | Bad asset remains unapproved and inaccessible                                |

Report load-generator hardware/location, server resource limits, Kafka partitions, room size, payload sizes and active-sender ratios. Avoid claiming an achieved concurrency or latency number without measurement. Kafka initial retention target is 24 h; 24 h is a recovery bound, not infinite protection.

## 9. Security and privacy baseline

HTTPS/WSS, secure cookie settings, CSRF/origin defenses, server-side RBAC, Zod validation, SQL constraints and transactions, audit logging, S3 private-by-default + limited presign, explicit CORS, request rate limiting, dependency scanning, secret management, database backup and restore. Do not use user IDs, room IDs or message IDs as high-cardinality Prometheus labels. Never include tokens, presigned URLs or raw uploaded contents in logs. Provide deletion and retention policies for user content.

## 10. Handoff artifacts / definition of done

- Source repository with `.env.example`, pinned runtime/toolchain, documented scripts, seed data and migration steps.
- Updated architecture and product documents; clean separation of delivered vs planned features.
- Live Vercel frontend and Railway API demo with a safe, limited-permission test account.
- Automated tests demonstrating authorization, duplicate likes, Kafka replay idempotency, and cross-replica WebSocket broadcast.
- CI/CD proof, deployment/rollback instructions, backup/restore drill, dashboards and sample incident diagnosis.
- Load test scenarios, raw results and written bottleneck analysis; résumé bullets only describe measured or genuinely implemented work.

## 11. Changes from original v1

- Replace **MongoDB message history** with **PostgreSQL message history**; no simultaneous dual writes.
- Replace **AWS EC2-based primary deployment** with **Vercel frontend/CDN + Railway backend, PostgreSQL and Redis**; managed Kafka chosen explicitly.
- Change **native `ws`** to **Socket.IO** for room joins and its Redis adapter; WebSocket-only transport for Railway multi-replica service unless sticky sessions are provided.
- Add **AWS S3** private presigned-upload flow, Better Auth session model, ownership-aware RBAC, CI/CD, observability and optional Inngest workflows.
- Clarify Redis responsibility: Pub/Sub for **cross-instance** fan-out, atomic danmaku limits, derived like counts and online presence; PostgreSQL remains authoritative for likes/history.
