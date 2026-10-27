# Local realtime throughput and PostgreSQL read benchmark

Date: 2026-10-27

Code: `751227a` plus the benchmark instrumentation committed with this report

Scope: the current `message.send` implementation, before adding session, room-status, or mute caches.

## Findings

1. **An ordinary new message executes four PostgreSQL `SELECT` statements and one `INSERT`.** `principalFromHeaders` issues two reads (`auth_sessions` and `users`), followed by one room-status read and one mute read. The earlier estimate of three reads counted application methods rather than SQL statements.
2. **The controlled local MST estimate is 200 messages/s**, at a 25 messages/s search resolution, for one API process, one room, and one distinct sender per connected client. Three independent five-minute 200/200 runs met the stated latency and delivery criteria. The next step, 225/225, passed twice and failed once on short-window latency; 250/250 and 275/275 failed.
3. **The estimate is provisional.** A fourth 200/200 run failed while the load generator was unable to maintain a uniform schedule. Its maximum dispatch delay was 694.68 ms, and both API and generator event loops stalled for more than one second. The cause of those simultaneous stalls is unproven. That run remains in the data; counting every local attempt without a generator-validity check does not support a single repeatable MST.
4. At 275/275, ACK p95 rose to 2,672.23 ms and 275 messages were rate limited in the 20–30 second window, after severe latency had already appeared in the first two windows. At 250/250, all 75,000 messages were accepted and delivered, but six ten-second windows exceeded the latency target. Capacity depends on the latency SLO, not only whether messages eventually arrive.

## Method and acceptance criteria

- PostgreSQL 18.6 and Redis 8.10.2 ran in local Docker containers. The API and Socket.IO load generator ran in separate Node.js 24.13.0 processes on the same physical workstation. Each run used one API instance, one live room, a fresh clone of the same migrated and seeded benchmark database, and a unique Redis key prefix.
- Each connection used a distinct account. The generator sent at a fixed target rate with one message per user per second. The realtime Redis message limiter stayed enabled. Only the benchmark login preparation bypassed the HTTP sign-in IP limiter. One warm-up message per connection preceded each 300-second measurement window.
- The offered rate is the number of unique `message.send` attempts per second. `endToEndAckMs` measures dispatch to the originating socket receiving `message.created`. Recipient latency measures dispatch to each joined socket receiving that event. These clients were all in the load-generator process, so the elapsed times use one monotonic clock. `fanout99LatencyMs` measures when 99% of members have received a particular message.
- The delivery verifier checked every expected socket-message pair for missing, duplicate, or wrong-room delivery, then allowed up to 15 seconds to drain. One-millisecond histogram buckets were used for delivery percentiles. This client-side verification adds work, so these runs are not directly comparable with earlier runs that did not enable it.
- A run passed if sender ACK p95 was at most 100 ms and p99 at most 500 ms; every ten-second window had ACK p95 at most 200 ms; recipient latency p95 was at most 250 ms and p99 at most 1,000 ms; at least 99.99% of expected deliveries arrived within one second; there were no missing or duplicate deliveries, ACK timeouts, rate-limit errors, or other send failures; and at least 99.9% of sends received ACKs inside the measurement window. The final in-flight message can be acknowledged immediately after the window.
- A rate was confirmed only after three valid five-minute runs passed. Generator validity was checked using dispatch-delay p99 at most 10 ms and maximum delay at most 250 ms. **These numerical generator-validity thresholds were selected after the 200c anomaly and applied to every run retrospectively.** They make the 200 messages/s estimate useful for local comparison, but it should not be presented as a pre-registered production capacity claim.

## Five-minute MST runs

All rates are offered messages per second. ACK and recipient values are milliseconds. `ACKs` counts sender confirmations received before the 300-second window ended; `accepted` can be slightly higher because a final ACK can arrive just after the window. The delivery column is unique recipient events received versus expected after drain.

| Run | Rate | Sent | ACKs in window | Failures | ACK p95 / p99 | Worst 10 s ACK p95 | Recipient p95 / p99 | Delivered / expected | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| [200a](mst/generator-200a.json) | 200 | 60,000 | 59,999 | 0 | 7.13 / 43.57 | 196.46 | 7 / 43 | 12,000,000 / 12,000,000 | Pass |
| [200b](mst/generator-200b.json) | 200 | 60,000 | 59,999 | 0 | 6.55 / 16.32 | 10.82 | 6 / 16 | 12,000,000 / 12,000,000 | Pass |
| [200c](mst/generator-200c.json) | 200 | 60,000 | 59,974 | 25 | 190.20 / 2,277.48 | 4,172.35 | 191 / 2,275 | 11,995,000 / 12,000,000 | Invalid schedule; failed SLO |
| [200d](mst/generator-200d.json) | 200 | 60,000 | 59,999 | 0 | 6.45 / 19.75 | 19.18 | 6 / 19 | 12,000,000 / 12,000,000 | Pass |
| [225a](mst/generator-225a.json) | 225 | 67,500 | 67,499 | 0 | 6.76 / 20.71 | 126.68 | 6 / 21 | 15,187,500 / 15,187,500 | Pass |
| [225b](mst/generator-225b.json) | 225 | 67,500 | 67,499 | 0 | 17.06 / 83.51 | 172.92 | 17 / 84 | 15,187,500 / 15,187,500 | Pass |
| [225c](mst/generator-225c.json) | 225 | 67,500 | 67,499 | 0 | 23.90 / 275.22 | 386.08 | 24 / 274 | 15,187,500 / 15,187,500 | Fail: three 10 s windows >200 ms |
| [250a](mst/generator-250a.json) | 250 | 75,000 | 74,997 | 0 | 77.40 / 333.36 | 683.90 | 77 / 332 | 18,750,000 / 18,750,000 | Fail: six 10 s windows >200 ms |
| [275a](mst/generator-275a.json) | 275 | 82,500 | 82,219 | 275 | 2,672.23 / 5,222.74 | 5,666.76 | 2,672 / 5,223 | 22,611,875 / 22,687,500 | Fail: backlog and rate limits |

The accepted messages persisted in PostgreSQL. [Measured row counts](mst/row-counts.json) equal accepted messages plus one warm-up message per connection: for example, 200a has 60,200 rows, 225a has 67,725, and 275a has 82,500. Missing deliveries in 200c and 275a correspond to rejected messages, not messages that were persisted but silently lost. In the three passing 200 runs, all 12 million expected deliveries per run arrived within one second. Their sender ACK p95 values ranged from 6.45 to 7.13 ms, and recipient p95 values ranged from 6 to 7 ms.

At 200c, generator dispatch-delay p99 was 11.53 ms and maximum was 694.68 ms. API and generator event-loop maximum delays were 1,397.75 and 1,067.97 ms. All other runs had dispatch-delay p99 below 10 ms and maximum below 250 ms. This is the basis for treating 200c as an invalid fixed-rate sample rather than silently removing it.

## Actual PostgreSQL statements

The benchmark API took `pg_stat_statements` snapshots immediately after warm-up and after all ACK and delivery-drain work. The generator waited for the first snapshot before sending. The difference counts executed SQL statements in that isolated database during the measurement window; the benchmark's own statistics query was excluded. Here, a **read** means one executed SQL `SELECT`, not a disk-page read. `INSERT ... RETURNING` is counted as one write.

| Message path step | PostgreSQL statement | Calls per new send attempt |
| --- | --- | ---: |
| Session token lookup | `SELECT ... FROM auth_sessions` | 1 |
| Principal user lookup | `SELECT ... FROM users` | 1 |
| Room live check | `SELECT ... FROM rooms` | 1 |
| Active mute check | `SELECT ... FROM room_mutes` | 1 |
| Message persistence, after admission | `INSERT INTO danmaku_messages ... RETURNING` | 1 if accepted |

| Run | Send attempts | SELECT calls | INSERT calls | Persisted rows including warm-up |
| --- | ---: | ---: | ---: | ---: |
| [200a API](mst/api-200a.json) | 60,000 | 240,000 | 60,000 | 60,200 |
| [200b API](mst/api-200b.json) | 60,000 | 240,000 | 60,000 | 60,200 |
| [200c API](mst/api-200c.json) | 60,000 | 240,000 | 59,975 | 60,175 |
| [200d API](mst/api-200d.json) | 60,000 | 240,000 | 60,000 | 60,200 |
| [225a API](mst/api-225a.json) | 67,500 | 270,000 | 67,500 | 67,725 |
| [225b API](mst/api-225b.json) | 67,500 | 270,000 | 67,500 | 67,725 |
| [225c API](mst/api-225c.json) | 67,500 | 270,000 | 67,500 | 67,725 |
| [250a API](mst/api-250a.json) | 75,000 | 300,000 | 75,000 | 75,250 |
| [275a API](mst/api-275a.json) | 82,500 | 330,000 | 82,225 | 82,500 |

The SELECT count is exactly four times the number of send attempts in each run. Rate-limited attempts still performed all four reads; they did not insert a message. Stage timers in the API include waiting for the connection pool and event-loop scheduling, so their latency does not represent PostgreSQL server execution time. The counts establish query volume, not that PostgreSQL is the only throughput bottleneck.

## Previous local baseline, kept alongside this run

The [previous baseline JSON files](previous-baseline/) were collected before this recipient-latency and SQL-count instrumentation. Its clean-database, single-room runs lasted 180 seconds. These results are context, not a before/after optimization comparison; the message caches have not been implemented.

| Previous scenario | Sender ACK p95 | Sender ACK p99 | ACK timeouts | Note |
| --- | ---: | ---: | ---: | --- |
| [200/200](previous-baseline/generator-clean-200-180.json) | 6.29 ms | 21.41 ms | 0 | 36,000 sent and acknowledged |
| [300/300, run A](previous-baseline/generator-clean-300-180.json) | 34.78 ms | 341.67 ms | 0 | Worst ten-second p95: 623.01 ms |
| [300/300, run B](previous-baseline/generator-clean-300b-180.json) | 1,326.03 ms | 1,890.20 ms | 0 | Same target, large repeat variance |
| [325/325](previous-baseline/generator-clean-325-180.json) | 7,892.21 ms* | 8,859.91 ms* | 22,830 | ACKs stopped in later windows |
| [350/350](previous-baseline/generator-clean-350-180.json) | 8,439.42 ms* | 9,571.47 ms* | 32,702 | ACKs stopped in later windows |

`*` Percentiles at the overloaded rates include only successful ACKs before the ten-second timeout; they understate the full tail of all attempted messages. The earlier exploratory 60-second 400/400 test had sender ACK p95 of [1,564.74 ms in one room](previous-baseline/generator-400-1.json) versus [13.65 ms across four rooms](previous-baseline/generator-400-four-1.json). The four-room run reduced nominal socket deliveries from about 160,000 to 40,000 per second. Those two runs used a database that accumulated data across exploratory tests, so the comparison is directional.

## Interpretation and limits

- A qualified result is **200 messages/s on this one-room local workload with full recipient verification and the stated SLO**. At 200 connections, that represents about 40,000 recipient events/s. It does not mean the application has a 40,000 messages/s MST.
- A single unqualified production MST is not established. The 200c incident and prior 300/300 repeat variance show that local host scheduling affects this result. A dedicated staging environment with a separate load-generator host is needed before using a capacity number as a production claim.
- Recipient timing in this run includes the load generator's event handling. Because the API, generator, PostgreSQL, and Redis shared one workstation, this is a controlled local benchmark rather than an isolated server-capacity measurement.
- For the planned cache optimization, the measured query-volume baseline is **four PostgreSQL reads plus one write per admitted new message**. Repeat the same instrumentation after the cache change and compare actual SELECT calls per send, cache hit rate, ACK and recipient latency, and the rate that meets the same SLO.

## Data and verification

- New [MST generator and API JSON files](mst/) include all nine long-run pairs and the [persisted row counts](mst/row-counts.json). The [diagnostic smoke runs](diagnostics/) validate SQL and recipient accounting with 100 formal messages, 400 SELECTs, 100 INSERTs, and 2,000 of 2,000 recipient events.
- [Previous baseline JSON files](previous-baseline/) contain 27 nonempty raw files from the earlier local tests. Failed, empty preparation files were excluded.
- Benchmark-only code adds SQL statement snapshots, a profiling-ready handshake, and bounded recipient-latency histograms. The production `message.send` path was not changed.
- `pnpm validate` and `git diff --check` were run after the benchmark instrumentation. The PostgreSQL global `shared_preload_libraries` setting was restored to its original empty value after data collection.
