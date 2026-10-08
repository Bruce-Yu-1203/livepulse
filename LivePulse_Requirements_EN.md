# LivePulse Live Interaction and Danmaku Platform Requirements

Version: 1.0  
Date: October 8, 2026  
Scope: Personal full-stack portfolio project and deployable demonstration system

## 1 Product Positioning and Goals

LivePulse is a full-stack platform for live rooms, real-time chat, scrolling danmaku messages, likes, and content moderation. The frontend uses Next.js, the backend runs on Node.js, and the entire project uses TypeScript. Its main engineering challenges are long-lived connections, cross-node fan-out, asynchronous persistence, and failure recovery. Video encoding and a self-hosted live-streaming CDN are outside the project scope.

After entering a room, users can watch a demonstration video, send messages, see danmaku from other viewers, and browse message history. Hosts can create rooms, control room status, and mute users. Administrators can handle reported or prohibited content. The project must provide repeatable deployment, load-testing, and failure-demonstration procedures so it can serve as evidence of engineering skills for Full-Stack, Backend, and SDE roles.

All performance figures in this document are targets that must be validated. They are not achieved results. The connection and throughput figures shown in the original reference image are not commitments for this project.

## 2 User Roles and Permissions

| Role | Core Permissions | Restrictions |
| --- | --- | --- |
| Guest | Browse public rooms, watch the demo video, and read public chat | Cannot send messages or like a room |
| Viewer | Send messages, like rooms, read history, and report content | Subject to rate limits, mutes, and room status |
| Host | Create and manage owned rooms, end an interaction session, and mute room users | Cannot manage another host's rooms |
| Admin | Manage users, review reports, remove prohibited messages, and view the operations dashboard | Sensitive actions must create audit records |

The backend enforces every permission. Hiding a frontend control is not authorization. Identity and roles use role-based access control (RBAC).

## 3 Delivery Phases and Scope

| Phase | Deliverables | Completion Criteria |
| --- | --- | --- |
| A Core MVP | Registration and login, room list and details, demo video, chat and danmaku, history, likes, basic permissions, one gateway, and Docker Compose | Two browsers can complete the full interaction flow; core automated tests pass |
| B Distributed Reliability | Multiple gateways, Kafka processing, Redis fan-out, retry and deduplication, presence, muting, recovery, monitoring, and load tests | Users connected to different gateways can communicate; restarting a worker does not create duplicate history records |
| C Cloud Delivery | AWS EC2, GitHub Actions, container images, TLS, backups, deployment, and rollback | The public demo is reachable; the pipeline can deploy and roll back to a specified image |
| D Kubernetes Extension | Local cluster validation, k3s demo on EC2, rolling updates, graceful shutdown, and autoscaling experiments | Clients reconnect during releases; resource and latency measurements are documented |

The MVP may write directly to MongoDB to complete the first business flow. Phase B must switch to Kafka ingestion followed by worker persistence. Both paths evolve behind the same message service interface and must not perform simultaneous dual writes.

Out of scope: real payments and virtual gifts, video ingest and transcoding, multi-region disaster recovery, machine-learning recommendations, and a complete automated moderation model. The demo video must be legally usable. Danmaku belongs to the current room session and does not synchronize with a video playback timeline.

## 4 Functional Requirements and Acceptance Criteria

### FR01 Authentication

The platform supports email-and-password registration, login, and logout. A user remains signed in after refreshing the page. Duplicate email addresses, invalid credentials, and unauthorized requests return stable error codes. Passwords use a secure hash. Sessions use secure cookies, and logout invalidates the refresh session.

Acceptance: an unauthenticated user cannot send a message; a normal user receives 403 when requesting an admin API; long-lived credentials are not exposed to frontend JavaScript.

### FR02 Room Management

A host creates a room with a title, description, cover image, and demo video URL. Room states are DRAFT, LIVE, and ENDED. The first version permits only DRAFT to LIVE to ENDED. Reopening requires a new room so that message-history boundaries remain unambiguous. LIVE means the interactive session is open; it does not mean the platform provides video ingest.

Acceptance: only visible rooms appear in public results; a non-owner cannot modify a room; an ended room rejects new joins and messages. Room-end propagation may have a cache-invalidation window of up to five seconds. Messages accepted during that window remain valid. A successful API update does not imply that every in-flight request disappears immediately.

### FR03 Real-Time Chat and Danmaku

Room messages appear in both the chat panel and the video overlay. Message text is limited to 1–200 Unicode characters. The initial WebSocket frame limit is 4 KiB. Unknown fields and invalid types are rejected. Users may disable danmaku or change its display density. Each message appears once by default, with a stable message ID used for deduplication.

Message states are pending, accepted, and failed. Accepted means the backend received Kafka's write acknowledgement. It does not mean every viewer received the message or that MongoDB persistence has completed. When an acknowledgement is lost, the client retries with the same clientMessageId and retains unresolved local messages for up to five minutes.

Acceptance: after user A sends a message, user B can see it; the sender does not see a duplicate caused by optimistic rendering and the later broadcast; when Kafka is unavailable, the client receives an explicit failure or timeout rather than a false success.

### FR04 Joining and Reconnection

After authentication, a client joins a room and subscribes to its message and statistics events. After disconnection, it reconnects with jittered exponential backoff, beginning near one second and capped at 30 seconds. An authentication failure stops automatic retries and asks the user to sign in again.

The first version uses best-effort real-time delivery. After reconnecting, the client queries persisted history and merges it using the latest cursor and stable message IDs. If persistence is still in progress, the UI shows a synchronizing state, retries a limited number of times, and then offers manual refresh. The platform does not promise zero loss or end-to-end exactly-once delivery.

Acceptance: a client recovers from a ten-second network interruption without reloading the page; persisted messages can be recovered; temporarily unpersisted messages are not immediately reported as permanently lost. The same recovery test applies after a gateway restart.

### FR05 Message History

History is queried by room. The default page size is 50 and the maximum is 100, using opaque cursor pagination. Each result includes the message ID, author, text, server timestamp, ordering position, and deletion state. Normal history retention is configurable and initially set to seven days. Permanent retention is not promised.

Acceptance: adjacent pages contain no duplicates; data never leaks between rooms; repeated event consumption does not create duplicate history records. The frontend does not use large offset pagination. A message position contains its Kafka partition and offset, and the offset is serialized as a string to avoid JavaScript number-precision problems.

### FR06 Likes

In the first version, each authenticated user can have at most one active like for a room. Users can like and unlike. Repeating the same request does not increase the count more than once. A SQL unique constraint is the source of correctness; the UI count is an asynchronously updated read model.

Acceptance: concurrent duplicate like requests from one user create only one database row; after an unlike, the displayed count eventually converges. Under normal conditions, the UI converges within five seconds of the SQL update. The count can be rebuilt from SQL after Redis restarts.

### FR07 Presence

The system tracks connection count and unique online-user count separately. The UI primarily displays unique users. Multiple tabs from one account do not increase the unique-user count. Presence is an expiring estimate and is not presented as a strongly consistent exact value.

The initial heartbeat interval is 15 seconds. A connection expires after 45 seconds without a heartbeat. Statistics are broadcast every five seconds. A clean disconnect is removed promptly; an abnormal disconnect or gateway crash converges in approximately 60 seconds. Statistics events may be coalesced, and obsolete values may be discarded.

Acceptance: two tabs from one account produce two connections and one unique user; forcefully terminating a gateway does not leave users online forever.

### FR08 Rate Limiting and Backpressure

The initial limit is an average of one message per second per user per room, with bursts of up to five. The platform also enforces configurable per-IP connection and send limits. A rate-limited client receives a retry delay. When Redis is unavailable, the service either stops accepting new messages or applies a stricter local limit and exposes the degraded state.

The gateway maintains a bounded send buffer for every connection. After the threshold is exceeded, statistics events are coalesced first. A persistently blocked connection is closed and instructed to reconnect. A slow client cannot block the entire room, and messages cannot accumulate without a bound.

Acceptance: an abusive user is limited while normal users can continue interacting; a slow connection does not cause unbounded gateway memory growth; intentional drops and disconnects are recorded as metrics.

### FR09 Moderation

The platform supports a basic prohibited-word filter, host-initiated mutes, administrator deletion, and user reports. A mute has effective and expiry times. User text is rendered as plain text and never executed as HTML. Deleted messages retain a tombstone with the message ID so that history recovery cannot restore prohibited text.

The first version deletes only persisted messages. MongoDB is authoritative for the deletion result, and the service sends a room deletion event. If a client misses the real-time event, reconnection or periodic history synchronization reapplies the tombstone. Cross-node mute caches use active invalidation and a short TTL.

Acceptance: a user muted through one gateway cannot continue sending through another; reloading history after a deletion never returns the original text; every moderation action records the actor, time, and target.

### FR10 Operations and Delivery

Dashboards show connection count, accepted-message rate, downstream delivery attempts, latency, Kafka lag, worker failures, Redis errors, and resource usage. The business admin page displays only a summary; Grafana provides detailed operational dashboards. The repository includes a README, seed data, an environment-variable example, architecture documentation, and a demonstration script.

Acceptance: one message ID can correlate gateway, fan-out, and persistence logs; build, start, and load-test commands are repeatable; test credentials are not committed to Git.

## 5 Frontend Pages

| Page | Content | Primary States |
| --- | --- | --- |
| Registration and Login | Email, password, and validation errors | Submitting, failed, successful |
| Room List | Cover, host, status, and audience size | Loading, empty, failed |
| Room Details | Demo video, danmaku, chat, likes, and history | Connecting, connected, reconnecting, ended |
| Host Console | Create, open, end, and moderate rooms | Unauthorized, successful, conflict |
| Admin Console | Reports, content removal, user management, and metric summary | Pagination, action confirmation, audit result |

The room page must distinguish “message accepted” from “connection interrupted” and support both mobile and desktop layouts. Under high traffic, the chat list uses virtualization and the danmaku overlay caps the number of simultaneous items so that the browser does not become the bottleneck.

## 6 Nonfunctional Requirements

### 6.1 Initial Performance Targets

The following Phase B acceptance targets are tested only after the complete machine configuration is recorded. If a target is missed, the measured bottleneck and adjustment must be documented. An unmet target must never be presented as an achieved resume metric.

| Scenario | Load and Duration | Target |
| --- | --- | --- |
| Idle connections | 1,000 joined connections for 10 minutes, heartbeats only | Unintentional disconnect rate below 1%; no continuing memory growth |
| Steady chat | 1,000 connections across 10 rooms; 100 total inbound messages/s for 10 minutes; each message is broadcast to every connection in its room | Accepted P95 below 300 ms; sender-to-observer P95 below 500 ms |
| Hot room | 1,000 connections in one room; 20 inbound messages/s for five minutes | Record the approximately 20,000 theoretical downstream deliveries/s, actual deliveries, and buffer behavior |
| Short burst | 10 rooms, 1,000 connections, 500 total inbound messages/s for 30 seconds | Bounded queues and explicit throttling; accepted messages eventually persist; lag returns to baseline within 120 seconds after steady load resumes |
| Consumer recovery | Stop a worker for 30 seconds and restart it | Every accepted test message persists within 120 seconds after recovery, with zero duplicate history records |

Every test specifies whether fan-out is enabled, users per room, message size, active-sender ratio, connection reuse, resource limits, and load-generator location. The sending rate must respect per-user limits: 500 messages per second requires enough active accounts. If the load generator competes with the server for the same CPU, the report must say so.

### 6.2 Data Semantics and Recovery

- Kafka consumption is at least once, and persistence is idempotent by message ID.
- One room preserves Kafka append order within a fixed partition layout. There is no global order across rooms, and client timestamps do not determine order.
- Real-time fan-out can be missed, while history is eventually consistent. A client may receive a duplicate message and must deduplicate it.
- A single-machine demo environment makes no high-availability claim. The deployment guide documents the outage and data-loss risks of one Kafka broker and one Redis instance.
- Initial Kafka retention is 24 hours. The maximum tolerable persistence outage must stay below that window, and disk capacity is calculated separately.

### 6.3 Security and Maintainability

TLS, request validation, secure cookie attributes, CSRF protection, WebSocket Origin checks, authorization, password hashing, and dependency scanning are baseline requirements. Logs never contain passwords, access tokens, or raw session cookies. User data has a cleanup policy.

Configuration is separated for development, testing, and the cloud demo. Every REST endpoint has an OpenAPI contract, and WebSocket events use shared schemas. Automated tests cover critical state changes, pagination, idempotency, permissions, and consumer failures. Every performance claim must come from a measured test.

## 7 Core Business Flows

Message sending: join room → validate identity and room state → apply rate and content checks → append to Kafka → return accepted → Broadcast Worker forwards through Redis → each gateway pushes to its local room connections; an independent History Worker writes batches to MongoDB.

Likes: submit REST request → SQL transaction applies the unique operation and writes an outbox event → return the user's current like state → outbox publisher and statistics worker update Redis → periodically broadcast the latest count.

Recovery: connection breaks → reconnect with backoff → authenticate and rejoin → load history and a statistics snapshot → merge buffered real-time events → deduplicate and sort by position.

## 8 Failure Acceptance Matrix

| Failure | User Experience | Required Verification |
| --- | --- | --- |
| Gateway exits | Temporary disconnection followed by automatic reconnection | Expired presence is removed; persisted history can be recovered |
| Kafka unavailable | New message fails or times out and may be retried with the same ID | No false accepted response; retry does not duplicate history |
| MongoDB unavailable | Real-time interaction may continue while history is delayed | Consumer lag increases; the consumer does not commit past an unprocessed offset |
| Redis unavailable | Fan-out, rate limits, and presence degrade | Degraded state is visible; history and counts can be rebuilt after recovery |
| Consumer crashes after processing but before offset commit | The event is processed again | MongoDB does not duplicate the record; the frontend deduplicates by ID |
| Slow client | Client is throttled or disconnected and can reconnect | Per-connection buffer remains bounded; normal connections are not delayed |

## 9 Suggested Development Schedule

Plan for six to eight weeks at approximately 15–20 hours per week. Week 1 establishes the repository and authentication. Week 2 implements rooms and single-node interaction. Week 3 adds Kafka and the MongoDB worker. Week 4 implements multiple gateways, presence, and recovery. Week 5 adds tests, monitoring, and load testing. Week 6 completes EC2 and CI/CD. Weeks 7–8 cover Kubernetes, failure experiments, and documentation. The actual schedule depends on familiarity with the stack; the first three phases can be completed before the optional extensions.

Final acceptance deliverables include source code, a live demo, the requirements and architecture documents, test results, a load-test report, and deployment and recovery instructions. Only measured connection counts, message rates, latency, and recovery results may appear on the resume.
