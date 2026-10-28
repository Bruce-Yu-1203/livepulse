# Local realtime benchmark after message-path caching

Date: 2026-10-28

Application code: `5a14c89`

Comparison: [2026-10-27 pre-cache baseline](../local-mst-postgres-2026-10-27/README.md)

## Result

- The controlled local MST is **275 messages/s**, at the same 25 messages/s search resolution and SLO as the 2026-10-27 baseline. Three valid, independent, five-minute 275/275 runs passed. A fourth 275/275 attempt is retained but invalid because the generator's maximum dispatch delay exceeded the preexisting 250 ms validity limit. At 300/300, one valid run passed and one valid run failed; 325/325 failed. The previous controlled estimate was 200 messages/s, so the confirmed local rate increased by **37.5%** under this workload.
- At 200/200, the post-cache run issued **11,083 PostgreSQL SELECTs for 60,000 sends**, or 0.185 SELECT/send. The comparable pre-cache 200/200 run issued exactly 240,000 SELECTs, or 4.000/send. This is a **95.4% reduction** in SELECT calls. All 60,000 messages still had one INSERT each. The 275/275 passing runs used 0.185–0.187 SELECT/send.
- At 200/200, sender ACK p95 was **6.32 ms** after caching versus **6.45–7.13 ms** in the three valid pre-cache runs. Those values overlap, so this low-load p95 does not demonstrate an ACK improvement. The stronger ACK comparison is at the same offered rate of 275/275, where the old path overloaded and the cached path passed in three valid runs.

## Rate-matched ACK comparison

| Offered rate | Pre-cache result | Post-cache result | What the comparison supports |
| --- | --- | --- | --- |
| 200/200 | Three valid passes; ACK p95 6.45–7.13 ms | One run; ACK p95 6.32 ms | Low-load ACK latency is similar. The p95 difference is too small and the ranges overlap. |
| 275/275 | One run; ACK p95 2,672.23 ms, p99 5,222.74 ms, worst 10 s p95 5,666.76 ms; 275 attempts were rate limited and 75,625 expected recipient events were missing as a result | Three valid passes; ACK p95 6.64, 9.21, and 11.36 ms; all 82,500 sends were ACKed and all 22,687,500 recipient events arrived in each run | At the same offered rate, the cached path repeatedly meets the latency and delivery SLO where the pre-cache run failed with backlog and rate limits. |

The 275/275 p95 is supporting evidence, not a standalone causal estimate: the pre-cache side has one run and its ACK histogram contains only successful ACKs (82,225 samples out of 82,500 attempts), while each post-cache histogram contains all 82,500 ACKs. The stronger claim is the SLO outcome at the matched offered rate, backed by three valid post-cache runs. To make a p95-only claim, repeat the pre-cache 275/275 test several times under the same five-minute setup and compare the distributions, not one run against one run.

## Method and thresholds

The setup and acceptance thresholds match the [October 27 method](../local-mst-postgres-2026-10-27/README.md#method-and-acceptance-criteria). PostgreSQL 18.6 and Redis 8.10.2 ran in local Docker containers. The API and Socket.IO generator ran as separate Node.js 24.13.0 processes on the same workstation. Every run used one API process, one live room, a fresh clone of `livepulse_benchmark_template_20261027`, and a unique Redis key prefix. Each connection had a distinct account and sent one message per second. The Redis message limiter remained enabled; only benchmark login preparation bypassed the HTTP sign-in IP limiter. Each client sent one warm-up message before the 300-second measurement window.

`BENCHMARK_VERIFY_DELIVERIES=1` checked every expected recipient/message pair, including duplicates and wrong-room events, with up to 15 seconds for the final drain. Sender ACK latency is dispatch to the sender's `message.created`; recipient latency is dispatch to each joined socket's `message.created`. The same generator process timestamps both endpoints. `pg_stat_statements` snapshots were taken after warm-up and after ACK/delivery drain in the isolated run database. The benchmark statistics query was excluded. A SELECT is one executed SQL statement, not a disk-page read. `INSERT ... RETURNING` counts as one write.

A valid run required generator dispatch-delay p99 at most 10 ms and maximum at most 250 ms. A passing run required sender ACK p95 at most 100 ms and p99 at most 500 ms; every 10-second window ACK p95 at most 200 ms; recipient p95 at most 250 ms and p99 at most 1,000 ms; at least 99.99% of expected deliveries within one second; zero missing/duplicate/wrong-room deliveries, ACK timeouts, rate-limit errors, or other send failures; and at least 99.9% of sends ACKed inside the 300-second window. A rate was confirmed after three valid five-minute passes. These are the same retrospective generator-validity thresholds used for the October 27 comparison.

## Five-minute runs

All latency figures are milliseconds. `ACKs in window` excludes confirmations arriving just after second 300; every run eventually ACKed every sent message. Delivery counts are unique recipient events after drain.

| Run | Rate | Sent | ACKs in window | ACK p95 / p99 | Worst 10 s ACK p95 | Recipient p95 / p99 | Delivered / expected | Dispatch p99 / max | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| [200a](mst/generator-200a.json) | 200 | 60,000 | 60,000 | 6.32 / 18.52 | 74.34 | 6 / 18 | 12,000,000 / 12,000,000 | 0.66 / 56.62 | Pass |
| [250a](mst/generator-250a.json) | 250 | 75,000 | 75,000 | 5.98 / 17.22 | 19.96 | 5 / 16 | 18,750,000 / 18,750,000 | 0.69 / 43.92 | Pass |
| [275a](mst/generator-275a.json) | 275 | 82,500 | 82,499 | 6.64 / 21.96 | 42.87 | 6 / 21 | 22,687,500 / 22,687,500 | 1.35 / 57.21 | Pass |
| [275b](mst/generator-275b.json) | 275 | 82,500 | 82,499 | 9.21 / 54.82 | 118.90 | 9 / 55 | 22,687,500 / 22,687,500 | 2.77 / 92.13 | Pass |
| [275c](mst/generator-275c.json) | 275 | 82,500 | 82,499 | 12.15 / 186.62 | 1,218.91 | 12 / 189 | 22,687,500 / 22,687,500 | 4.73 / 405.99 | Invalid schedule; failed SLO |
| [275d](mst/generator-275d.json) | 275 | 82,500 | 82,499 | 11.36 / 36.29 | 46.69 | 11 / 37 | 22,687,500 / 22,687,500 | 3.49 / 96.00 | Pass |
| [300a](mst/generator-300a.json) | 300 | 90,000 | 89,998 | 9.41 / 42.67 | 134.97 | 9 / 43 | 27,000,000 / 27,000,000 | 2.66 / 55.33 | Pass |
| [300b](mst/generator-300b.json) | 300 | 90,000 | 89,999 | 22.67 / 81.22 | 281.76 | 22 / 82 | 27,000,000 / 27,000,000 | 6.42 / 140.21 | Fail: 10 s ACK p95 |
| [325a](mst/generator-325a.json) | 325 | 97,500 | 97,497 | 63.71 / 283.94 | 466.22 | 64 / 285 | 31,687,500 / 31,687,500 | 7.80 / 160.02 | Fail: 10 s ACK p95 |

All nine runs had zero send failures, zero missing/duplicate/wrong-room deliveries, and 100% of persisted message deliveries eventually observed. The 275c sample had a 405.99 ms maximum generator dispatch delay, while the API and generator event loops stalled for up to 325.32 and 435.68 ms. Its 150–160 second window reached 1,218.91 ms ACK p95. The cause of the simultaneous stalls is not established; the run remains visible and was excluded according to the same generator-validity rule as the baseline. The valid 300b and 325a failures show that complete eventual delivery alone does not meet the short-window latency SLO.

## PostgreSQL statement counts

The SELECT breakdown is exact for the measured window. The `auth_sessions` and `users` counts move together because a session principal refresh reads both tables. Room-status misses and mute-status misses are the remaining reads. Cache counters in the API files include warm-up and other activity outside the SQL snapshot, so the SQL statement delta is the authoritative per-send count.

| Run | Session SELECT | User SELECT | Room SELECT | Mute SELECT | Total SELECT | SELECT/send | INSERT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [200a API](mst/api-200a.json) | 3,711 | 3,711 | 30 | 3,631 | 11,083 | 0.185 | 60,000 |
| [250a API](mst/api-250a.json) | 4,700 | 4,700 | 30 | 4,505 | 13,935 | 0.186 | 75,000 |
| [275a API](mst/api-275a.json) | 5,191 | 5,191 | 30 | 5,031 | 15,443 | 0.187 | 82,500 |
| [275b API](mst/api-275b.json) | 5,182 | 5,182 | 30 | 4,893 | 15,287 | 0.185 | 82,500 |
| [275c API](mst/api-275c.json) | 5,203 | 5,203 | 30 | 4,813 | 15,249 | 0.185 | 82,500 |
| [275d API](mst/api-275d.json) | 5,185 | 5,185 | 30 | 5,005 | 15,405 | 0.187 | 82,500 |
| [300a API](mst/api-300a.json) | 5,636 | 5,636 | 30 | 5,373 | 16,675 | 0.185 | 90,000 |
| [300b API](mst/api-300b.json) | 5,632 | 5,632 | 30 | 5,031 | 16,325 | 0.181 | 90,000 |
| [325a API](mst/api-325a.json) | 6,095 | 6,095 | 30 | 4,973 | 17,193 | 0.176 | 97,500 |

The [persisted row counts](mst/) equal the accepted formal messages plus one warm-up message per connection in every run: 60,200 for 200a, 82,775 for each 275 run, and 97,825 for 325a. The 30-second [diagnostic run](diagnostics/) had 600/600 ACKs, 12,000/12,000 deliveries, 62 SELECTs, and 600 INSERTs in its formal window. Its 62 reads comprise 20 session, 20 user, 2 room, and 20 mute SELECTs.

## Interpretation and limits

- The confirmed number applies to this **single-room local workload** with 275 connected senders and about 75,625 recipient events per second. It is not a production capacity claim. The API, generator, PostgreSQL, and Redis shared one workstation, so host scheduling and generator work affect observed latency.
- Cache reads did not fall to zero because the session principal and mute entries expire and refresh. The room status was read about once per 10 seconds during each five-minute run. The SELECT reduction is measured, while the precise contribution of each cache to ACK or MST improvement is not separately identified by this combined before/after test.
- At 200/200, ACK p95 after caching is within the baseline's passing range. At higher rates, the 300/300 and 325/325 short-window failures remain. A separate load-generator host and repeat runs would be needed before using the rate for capacity planning.

## Data and verification

The [raw API and generator JSON files](mst/) are retained for every formal attempt, including failures and the invalid-schedule run. [Result assertions](benchmark-results.test.mjs) verify duration, offered rate, ACK and delivery accounting, SQL writes, persisted rows, schedule validity, SLO verdicts, three valid 275/275 passes, and the rate-matched baseline values above. `pnpm validate` passed with 457 tests, and all 58 database integration tests passed on a separate cloned database with the project environment loaded. PostgreSQL's global `shared_preload_libraries` setting was restored to its original empty value after collection.
