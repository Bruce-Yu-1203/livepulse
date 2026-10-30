# Local write-outage benchmark: direct vs Kafka message pipeline

Date: 2026-10-30

Application code: `0f2735c` (includes `86a086a`, the Kafka dual-consumer pipeline). Harness: `471226d`–`1343beb` on this branch.

## Result

Each run sent 200 messages/s from 200 connections in one room for 180 s. At about t=60 s a separate session held `LOCK TABLE danmaku_messages IN SHARE MODE` for 40 s. That blocks message inserts, while reads of other tables continue to work. There were three runs per mode, interleaved direct/Kafka.

**The two ACKs make different promises, so ACK latency is not a like-for-like comparison.** A direct ACK means the row is in PostgreSQL. A Kafka ACK means the message was written to Kafka with `acks=all`, and a separate worker writes it to PostgreSQL later. The table therefore leads with mode-neutral metrics, which have the same endpoint in both modes:

- Delivery to viewers: each recipient socket receives the message.
- Time until the row exists in PostgreSQL.

ACK figures follow, labeled by what they promise.

| Metric (3 runs each) | Direct (`MESSAGE_PIPELINE=direct`) | Kafka (`MESSAGE_PIPELINE=kafka`) |
| --- | --- | --- |
| **Mode-neutral: viewer deliveries / expected** | 5,786,400–5,791,200 / 7,200,000 (**80.4%**) | 7,200,000 / 7,200,000 (**100%**) |
| **Mode-neutral: viewer delivery latency p95 / p99** (send → each recipient) | 8–12 ms / **39.1 s** | 11–14 ms / 14–33 ms |
| **Mode-neutral: deliveries within 1 s** | 77.0% | 100% |
| **Mode-neutral: measured messages that ever reached PostgreSQL** | 28,932–28,956 / 36,000 (80.4%) | 36,000 / 36,000 (100%) |
| **Mode-neutral: time to persisted, p50 / p95 / p99 / max** (stored messages only, ±1 s) | 0 / 0 / 37.0–37.3 / 38.4–38.7 s | 0–1.5 / **35.9–39.5** / 40.9–41.1 / 41.8–42.4 s |
| **Mode-neutral: worst 10 s send window, time-to-persisted p95** | 38.1–38.4 s (t=60–70 s) | 41.5–41.9 s (t=60–70 s) |
| ACK = "in PostgreSQL" (direct) or "in Kafka" (Kafka): send success, all failures counted | **76.97–77.00%** (27,709–27,719 / 36,000) | **100%** (36,000 / 36,000) |
| Send success, `REALTIME_RATE_LIMITED` excluded from the denominator | **81.98–82.01%** (27,709–27,719 / 33,801) | 100% |
| Failures by code | `ack_timeout` 6,066–6,090; `REALTIME_RATE_LIMITED` 2,199 (every run); `SERVICE_UNAVAILABLE` 0–16 | none |
| ACK p50 / p95 / p99 of ACKed sends | 3.2 / 5.3–5.7 / 8.0–10.4 ms | 2.0–2.4 / 4.7–7.4 / 7.9–20.3 ms |
| Worst 10 s ACK p95 | 5.8–6.7 ms over windows that had ACKs; **3 consecutive 10 s windows (t=70–100 s) had zero ACKs** | 5.5–25.4 ms; every window had ACKs |
| ACKed but not persisted (loss) | 0 | 0 |
| Reported failed to the sender but persisted anyway | **1,223–1,245** | 0 |
| Duplicate rows / duplicate deliveries | 0 / 0 | 0 / 0 |
| Peak backlog | 10 lock-waiting sessions (the whole Prisma pool, 11 active) | Persistence consumer lag 9,549–10,326; broadcast lag ≤13 |
| Backlog drain after the lock is released | Blocked inserts completed within one 1 s sample | Persistence lag back to the pre-fault level in **27, 31 and 60 s** |

- **On the mode-neutral metrics, Kafka keeps viewers live but does not make storage faster.** Kafka delivered 100% of messages to viewers with p99 ≤33 ms, against direct's 80.4% and a 39 s p99. Kafka also stored every message, while direct stored 80.4%. The time-to-persisted is about the same for the messages each mode stored: about 38–42 s for messages sent at the start of the outage. Kafka's p95 is higher (36–40 s against 0 s) because it kept all 8,000 outage messages and wrote them late, while direct rejected most of them. The Kafka pipeline trades PostgreSQL write latency for user-visible availability; it does not reduce that latency.
- **Direct mode cannot accept messages while PostgreSQL rejects writes.** All 8,281–8,291 failures per run fall between t=60 and t=110 s. The 0–60 s and 110–180 s windows had 0 failures and ACK p95 around 5 ms. For 30 s (t=70–100 s) no sender received any ACK.
- **Kafka mode was not affected on the send or broadcast path.** Admission ACKs and fan-out do not touch PostgreSQL, so every message was ACKed and delivered to every recipient with p95 ≤14 ms throughout the outage. Only the persistence consumer stalled. It built up a ~10,000-message backlog and then wrote every message after the lock was released, with no loss and no duplicates.
- Time-to-persisted is estimated from the per-second `danmaku_rows` sample against each stored message's scheduled send time, assuming rows arrive in send order (accurate to about ±1 s; see [`benchmark-pipeline-persistence-delay.mjs`](../../apps/api/scripts/benchmark-pipeline-persistence-delay.mjs)). Per-window viewer latency was not recorded in these runs. The verifier reports overall percentiles only, so the worst-window figures above use time-to-persisted and ACK.
- The cost in Kafka mode is **delayed durability in PostgreSQL**. Messages were ACKed and delivered but appeared in history queries 27–60 s after the lock ended. Kafka is the only durable copy during that time.

## Method

- Infrastructure: `infra/compose` Postgres 18.6, Redis 8.10.2, and Kafka 4.1.2 (KRaft, **single broker, replication factor 1**) in Docker Desktop on an Apple M4 (10 cores, 16 GiB). The compose `api`, `broadcast-worker`, and `persistence-worker` containers were not running. PostgreSQL had no CPU limit (`NanoCpus` = 10 CPUs, the whole VM). Two idle benchmark API processes from an earlier, abandoned run were listening on ports 3101/3102 (0% CPU, no clients) and could not be stopped from this session. All runs used port 3121.
- Every run used a fresh clone of `livepulse_benchmark_template_20261030`, which is `livepulse_benchmark_template_20261027` with all migrations, including `message_tombstones`, applied. Each run also used a unique `REDIS_KEY_PREFIX`. Kafka runs used a fresh topic created with 12 partitions and RF=1, plus fresh `KAFKA_BROADCAST_GROUP` and `KAFKA_PERSISTENCE_GROUP` names. Both workers (`dist/messages/broadcast-main.js` and `persistence-main.js`) ran on the host with the same `DATABASE_URL` and Redis prefix as the API. Otherwise direct and Kafka runs were identical.
- [`apps/api/scripts/run-pipeline-benchmark.sh outage <mode> <run>`](../../apps/api/scripts/run-pipeline-benchmark.sh) starts the API (`benchmark-realtime-server.mjs`), the workers, the sampler, and the generator (`BENCHMARK_EXTERNAL_API=1`, `BENCHMARK_VERIFY_DELIVERIES=1`, one warm-up message per connection). It waits for the generator's measurement window to start, then at window +60 s runs `BEGIN; LOCK TABLE danmaku_messages IN SHARE MODE; SELECT pg_sleep(40); COMMIT;` through a separate `psql` session. The sampler saw the ShareLock from t=60.4–60.8 s until t=100.4–100.8 s.
- ACK latency runs from `message.send` to the sender's confirmation. In direct mode the confirmation is the broadcast `message.created`, which is only produced after the INSERT. In Kafka mode it is the separate admission `message.created` that echoes the send `requestId`, sent after the producer's `acks=all` write. The generator now separates the two in Kafka mode: the ACK copy is not counted as a delivery, and the broadcast copy is counted by the delivery verifier. The generator ACK timeout is 10 s. A response that arrives later is ignored, but the message is still counted if it is persisted or delivered.
- [`benchmark-pipeline-sampler.mjs`](../../apps/api/scripts/benchmark-pipeline-sampler.mjs) recorded once per second: `danmaku_messages` row count, active and total `pg_stat_activity` sessions, lock waiters, whether the ShareLock was held, persistence and broadcast consumer-group lag (kafkajs admin), and orchestrator markers (`window_start`, `fault_start`, `fault_end`, `generators_done`, `drained`). [`benchmark-pipeline-analysis.mjs`](../../apps/api/scripts/benchmark-pipeline-analysis.mjs) joins the generator JSON, the sampler CSV, and the run database. It counts persisted measurement indexes against ACKed and failed indexes and computes drain time. Drain time is the time from the first sample without the lock until Kafka persistence lag (or, in direct mode, PostgreSQL lock waiters and active sessions) returns to the largest value seen in the 30 s before the fault. Lag sampled under steady traffic is rarely exactly zero.
- The Redis per-user message limiter (capacity 5, refill 1/s) stayed enabled in both modes, as in the 2026-10-28 method.

## Per-run results

Latency in milliseconds unless marked. Every run sent 36,000 measured messages. Rows exclude the 200 warm-up messages, which were all persisted.

| Run | ACKed (success %) | Failures by code | ACK p50 / p95 / p99 | Worst 10 s ACK p95 | Delivered / expected | Recipient p95 / p99 | Persisted | Failed but persisted | Peak persistence lag | Drain | Dispatch p99 / max |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [direct-a](raw/summary-outage-direct-a.json) | 27,719 (77.00%) | ack_timeout 6,066; RATE_LIMITED 2,199; SERVICE_UNAVAILABLE 16 | 3.20 / 5.32 / 8.00 | 5.76 (+3 empty) | 5,790,200 / 7,200,000 | 8 / 39,130 | 28,951 | 1,232 | — | ≤1 s | 0.67 / 26.36 |
| [kafka-a](raw/summary-outage-kafka-a.json) | 36,000 (100%) | — | 2.00 / 4.66 / 7.85 | 5.50 | 7,200,000 / 7,200,000 | 11 / 14 | 36,000 | 0 | 9,549 | 27 s | 0.92 / 26.06 |
| [direct-b](raw/summary-outage-direct-b.json) | 27,711 (76.98%) | ack_timeout 6,090; RATE_LIMITED 2,199 | 3.25 / 5.71 / 9.55 | 6.12 (+3 empty) | 5,791,200 / 7,200,000 | 10 / 39,131 | 28,956 | 1,245 | — | ≤1 s | 0.74 / 38.53 |
| [kafka-b](raw/summary-outage-kafka-b.json) | 36,000 (100%) | — | 2.29 / 6.69 / 20.27 | 25.36 | 7,200,000 / 7,200,000 | 13 / 32 | 36,000 | 0 | 9,673 | 31 s | 1.21 / 32.90 |
| [direct-c](raw/summary-outage-direct-c.json) | 27,709 (76.97%) | ack_timeout 6,076; RATE_LIMITED 2,199; SERVICE_UNAVAILABLE 16 | 3.18 / 5.58 / 10.42 | 6.70 (+3 empty) | 5,786,400 / 7,200,000 | 12 / 39,140 | 28,932 | 1,223 | — | ≤1 s | 1.19 / 39.55 |
| [kafka-c](raw/summary-outage-kafka-c.json) | 36,000 (100%) | — | 2.43 / 7.44 / 20.03 | 17.76 | 7,200,000 / 7,200,000 | 14 / 33 | 36,000 | 0 | 10,326 | 60 s | 1.30 / 44.57 |

"+3 empty" means three 10 s windows in which messages were sent but none were ACKed. Their p95 is undefined and is excluded from the worst-window figure. Generator dispatch p99 stayed ≤1.3 ms in every run, so the schedule was valid. The maximum (26–45 ms) is below the 250 ms validity limit used on 2026-10-28.

Direct, ACKs and failures per 10 s window (run a; b and c differ by at most 20 messages per window):

| Window (s) | 0–60 | 60–70 | 70–80 | 80–90 | 90–100 | 100–110 | 110–180 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| ACKed / failed | 2,000 / 0 per window | 16 / 1,984 | 0 / 1,999 | 0 / 2,000 | 0 / 2,000 | 1,703 / 298 | 2,000 / 0 per window |

## Why direct mode shows `REALTIME_RATE_LIMITED`

Every generator connection sends exactly one message per second, and the limiter allows 5 tokens with a refill of 1/s. In the 140 fault-free seconds of each run and in all three Kafka runs, it rejected nothing. The 2,199 rejections per direct run are a side effect of the outage:

1. A socket caches its session principal for 15 s (`principalTtlMs` in `socket-session-state.ts`), so every connection refreshes it at least once during a 40 s outage.
2. The refresh is a read, which the ShareLock does not block. But all 10 Prisma pool connections are held by INSERTs waiting on the lock, so the refresh waits for a connection. Concurrent sends on the same socket share the pending refresh (`if (this.pending) return this.pending`) and queue behind it while the client keeps sending 1 message/s.
3. When the lock is released, the refresh completes and all the queued messages from that user reach the token bucket at once. Up to 5 pass and the rest receive `REALTIME_RATE_LIMITED`.

Evidence: the failures are confined to t=60–110 s. Each run had the same 2,199 rejections, about 11 per user. A rejection is only recorded if it arrives within the 10 s ACK timeout, so earlier queued messages appear as `ack_timeout` instead. Without the limiter these messages would most likely time out too. The limiter changes which error code the failures carry, not whether the outage window fails. Both success figures are reported above. **81.98% (rate-limited sends excluded from the denominator) is the conservative number for direct mode**, because it is the most favorable figure for the baseline.

## Kafka persistence consumer during the outage

In each Kafka run the persistence worker's interactive transaction waited on the lock longer than Prisma's transaction timeout and failed once with `MessageDatabaseUnavailableError`. Its consumer also missed heartbeats long enough for the group coordinator to drop it (8–11 `The coordinator is not aware of this member` responses per run). kafkajs rejoined and retried the uncommitted batch. Because `persistKafka` checks for an existing row under an advisory lock, the retry created no duplicates. Run c drained in 60 s rather than about 30 s. Its lag fell in steps (for example 10,326 → 8,252 → 6,778 → 5,304 → 3,830 → 2,956 → 1,682 → 111), which is consistent with a slower rejoin. The persistence worker processes two partitions concurrently, one message per transaction. It drained the backlog at a net 310–350 messages/s on top of the incoming 200 messages/s in runs a and b, and about 170 messages/s in run c. That was enough here, but a longer outage would take proportionally longer to drain. The broadcast worker logged no errors, and its lag never exceeded 13.

## Interpretation and limits

- Direct mode loses about 23% of sends (18% if rate-limited sends are excluded) and about 20% of recipient deliveries during a 40 s write outage in a 180 s window. That is almost exactly the 40 s outage plus a few seconds of recovery. Its other failure mode is silent: **1,223–1,245 messages per run were reported to the sender as failed but were stored and broadcast late.** Delivered/expected equals persisted × 200 in every direct run, so every stored message reached every recipient, some 39 s late. A client that retries a timed-out send with a new `clientMessageId` would therefore create a visible duplicate.
- Kafka mode keeps send and broadcast available through the outage. The trade-off is that an ACK means "durable in Kafka", not "in PostgreSQL". This setup is a single local broker with replication factor 1, so that durability is weaker than a replicated production cluster, and broker failure was not tested.
- These are local, single-host results. The API, workers, generator, PostgreSQL, Redis, and Kafka shared one workstation. They support a qualitative comparison of failure behavior, not production capacity numbers. The generator does not retry failed sends, while real clients might.
- Kafka's steady-state ACK p95 (4.7–7.4 ms) is similar to direct's (5.3–5.7 ms). The worst-window values of 17.8 and 25.4 ms in runs b and c occurred while the persistence worker was catching up. This benchmark does not show that Kafka improves latency under normal conditions.

## Data and verification

[`raw/`](raw/) contains, for every run: the generator JSON and log, the API profile JSON and log, the sampler CSV and log, the orchestrator event markers, run metadata (database, Redis prefix, topic, groups, PostgreSQL CPU limit), worker logs for Kafka runs, and the analysis summary. The cloned run databases (`livepulse_benchmark_kp_outage_*`) were kept. [`benchmark-results.test.mjs`](benchmark-results.test.mjs) checks the headline numbers in this README against the raw files.
