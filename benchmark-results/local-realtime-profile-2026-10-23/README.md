# Local realtime profile (2026-10-23)

The API, load generator, PostgreSQL, and Redis ran on the same workstation. The
API and generator were separate Node.js processes. All clients used the seeded
viewer account and joined the same room. Each measurement window lasted 30
seconds. The API code path was unchanged across these runs; the profiler only
wrapped methods to record elapsed time.

`ACK` here means the originating socket received `message.created` after
`message.send`. It is not a separate protocol ACK event.

| Run | Connections | Sent/s | Accepted | Accepted in 30 s | Errors | ACK p95 | API CPU time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [300/300](300-generator.json) | 300 | 300 | 9,000 | 8,997 | 0 | 13.95 ms | 24.53 s |
| [400/400 run 1](400-generator-run1.json) | 400 | 400 | 12,000 | 11,253 | 0 | 2,026.92 ms | 32.94 s |
| [400/400 run 2](400-generator-run2.json) | 400 | 400 | 12,000 | 11,637 | 0 | 871.65 ms | 32.23 s |

The two 400/400 runs show substantial variance, but both have much higher ACK
latency than 300/300. Every planned message was eventually accepted. API CPU
time approached or exceeded one core's time during both 400/400 measurement
windows.

## Server stage p95

| Stage | [300/300](300-api.json) | [400/400 run 1](400-api-run1.json) | [400/400 run 2](400-api-run2.json) |
| --- | ---: | ---: | ---: |
| Session check | 4.83 ms | 743.49 ms | 352.67 ms |
| Room live check | 2.19 ms | 377.02 ms | 177.50 ms |
| Mute check | 2.16 ms | 380.07 ms | 176.48 ms |
| PostgreSQL insert wrapper | 2.89 ms | 382.29 ms | 178.03 ms |
| Redis message publish | 3.24 ms | 13.33 ms | 13.31 ms |
| Message handler | 7.47 ms | 1,145.27 ms | 526.76 ms |
| Local broadcast call | 1.86 ms | 2.37 ms | 2.30 ms |

These timings include time awaiting asynchronous operations and scheduling in
the API process. The insert wrapper is not a PostgreSQL server query timer.
Stages overlap, so their percentiles must not be added together. The local
broadcast call returns before all asynchronous socket writes finish.

## PostgreSQL and CPU observations

The [higher-frequency PostgreSQL samples](400-postgres-run2.csv) were taken
about eight times per second. Of 295 samples with the API's 10 database
connections present, 232 showed no active query, 34 showed at least one active
backend waiting, and the maximum active count was five. The observed waits
included WAL writes and syncs. The [first run samples](400-postgres-run1.csv)
were taken roughly once per second. These snapshots do not show PostgreSQL
running at its connection limit or continuously busy. They cannot measure
waiting inside the API's database client pool or rule out brief WAL stalls.

The [CPU diagnostic profile](400-api.cpuprofile) showed prominent samples in
Socket.IO packet encoding, Engine.IO drain and flush, WebSocket and Node stream
writes, and native `writev`. Prisma client work also appeared. The diagnostic
run's [ACK p95](400-generator-cpu-diagnostic.json) was 4,847.99 ms, so it is
excluded from the comparison table because CPU profiling changed the load.
Its [server stages](400-api-cpu-diagnostic.json) are retained for inspection.

The strongest current evidence points to API-side work around Socket.IO
delivery as the local high-load limit. Each accepted message is sent to every
room member, so 400 messages per second and 400 members create about 160,000
socket deliveries per second. The database wrappers also slow sharply, but
these measurements do not establish that PostgreSQL execution is the primary
cause. Query-level timing or an isolated database workload would be needed to
separate server-side SQL time from client-side waiting.
