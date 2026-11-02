# Local benchmark: coalesced room broadcasts (2026-11-02)

Before: `main` at `59e762f` (one `message.created` frame per socket per message).
After: `260e787` with `REALTIME_BROADCAST_BATCH_MS=50` (per-room 50 ms window; held messages go out as one `message.batch` frame).

## Result

| | Before | After (50 ms window) |
| --- | ---: | ---: |
| Confirmed MST (three valid passes) | **400 msg/s** | **500 msg/s or more** |
| Next step up | 450: invalid and failed (ACK p95 2,115.89 ms) | 600: SLO met, but generator schedule invalid |
| API CPU at 400 msg/s (mean of 3 runs) | 0.67 core (0.62–0.75) | 0.18 core |
| Frames written per socket per second at 400 msg/s | 400 | 19.3 |
| Sender ACK p95 at 400 msg/s | 11.88–24.56 ms | 57.11–57.53 ms |

- Sustained single-room throughput rose by at least **25%** (400 → 500). The after side is bounded by the load generator, not the API: at 600 msg/s every SLO check passed while the generator's dispatch p99 was 12.61 ms, over the 10 ms validity limit. API CPU at 600 msg/s was 0.20 core.
- API CPU at the same 400 msg/s load fell by **73%** (0.67 → 0.18 core; 71–76% per run pair).
- The cost is latency: a held message waits for the end of its room's window, so ACK and recipient p95 settle near 57 ms at every rate from 325 to 600. In a shorter trial with a 100 ms window, ACK p95 was about 105 ms, over the 100 ms SLO, so 50 ms was kept.

## Method

All runs were on one Apple M4 (10-core, 16 GB) MacBook on 2026-11-01/02, back to back. Node.js 24.13.0, PostgreSQL 18.6 and Redis 8.10.2 in Docker. `MESSAGE_PIPELINE=direct`. One API process, one live room, one distinct user per connection, connections = messages/s, one message per user per second. Each run used a fresh clone of `livepulse_benchmark_template_20261101`, a unique Redis prefix, one warm-up message per connection, then a 300-second measurement window with `BENCHMARK_VERIFY_DELIVERIES=1`. `pg_stat_statements` was off.

Validity and pass rules are the same as the [2026-10-27](../local-mst-postgres-2026-10-27/README.md#method-and-acceptance-criteria) and [2026-10-28](../local-mst-postgres-cache-2026-10-28/README.md) reports: generator dispatch p99 ≤ 10 ms and max ≤ 250 ms; ACK p95 ≤ 100 ms and p99 ≤ 500 ms; every 10-second window ACK p95 ≤ 200 ms; recipient p95 ≤ 250 ms and p99 ≤ 1,000 ms; ≥ 99.99% of deliveries within one second; zero failures, missing, duplicate, or wrong-room deliveries. A rate is confirmed after three valid passes.

Absolute rates depend on the machine and its state that day. A later re-run on the same machine was measurably slower, so compare before and after only within this directory.

## Runs

Latency in ms. API core = (user + system CPU) / duration.

### Before (`59e762f`, no batching)

| Run | ACK p95 / p99 | Worst 10 s ACK p95 | Dispatch p99 / max | API core | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| [250a](before/generator-250a.json) | 5.09 / 9.26 | 9.70 | 0.57 / 47.52 | 0.35 | Pass |
| [275a](before/generator-275a.json) | 5.08 / 7.70 | 6.31 | 1.00 / 19.75 | 0.36 | Pass |
| [300a](before/generator-300a.json) | 5.06 / 7.41 | 5.47 | 1.04 / 18.71 | 0.39 | Pass |
| [300b](before/generator-300b.json) | 5.11 / 7.95 | 5.64 | 1.00 / 12.06 | 0.39 | Pass |
| [300c](before/generator-300c.json) | 4.96 / 7.32 | 5.47 | 0.89 / 14.02 | 0.39 | Pass |
| [325a](before/generator-325a.json) | 5.30 / 8.45 | 6.98 | 0.96 / 11.01 | 0.40 | Pass |
| [325b](before/generator-325b.json) | 5.74 / 10.54 | 15.54 | 1.07 / 22.54 | 0.43 | Pass |
| [325c](before/generator-325c.json) | 5.34 / 10.01 | 16.40 | 0.93 / 37.18 | 0.43 | Pass |
| [350a](before/generator-350a.json) | 5.75 / 9.39 | 7.39 | 0.88 / 29.41 | 0.45 | Pass |
| [400a](before/generator-400a.json) | 24.56 / 45.01 | 63.51 | 5.63 / 37.11 | 0.75 | Pass |
| [400b](before/generator-400b.json) | 11.88 / 22.30 | 26.01 | 3.05 / 28.54 | 0.62 | Pass |
| [400c](before/generator-400c.json) | 12.58 / 21.43 | 22.43 | 2.88 / 33.04 | 0.64 | Pass |
| [450a](before/generator-450a.json) | 2,115.89 / 3,596.21 | 4,127.62 | 17.20 / 146.89 | 0.98 | Invalid; failed SLO |

### After (`260e787`, 50 ms window)

| Run | ACK p95 / p99 | Worst 10 s ACK p95 | Dispatch p99 / max | API core | Frames/socket/s | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| [325a](after/generator-325a.json) | 56.85 / 61.66 | 57.49 | 4.99 / 24.96 | 0.17 | 19.34 | Pass |
| [400a](after/generator-400a.json) | 57.11 / 62.44 | 58.87 | 6.91 / 26.23 | 0.18 | 19.34 | Pass |
| [400b](after/generator-400b.json) | 57.53 / 62.79 | 59.20 | 7.17 / 29.28 | 0.18 | 19.31 | Pass |
| [400c](after/generator-400c.json) | 57.52 / 62.74 | 59.24 | 7.14 / 23.33 | 0.18 | 19.32 | Pass |
| [450a](after/generator-450a.json) | 57.65 / 63.45 | 58.94 | 8.32 / 46.12 | 0.18 | 19.32 | Pass |
| [500a](after/generator-500a.json) | 57.38 / 63.51 | 58.64 | 8.98 / 45.81 | 0.18 | 19.38 | Pass |
| [500b](after/generator-500b.json) | 57.62 / 63.93 | 59.87 | 9.28 / 55.86 | 0.18 | 19.37 | Pass |
| [500c](after/generator-500c.json) | 57.14 / 63.56 | 58.93 | 8.95 / 33.57 | 0.17 | 19.37 | Pass |
| [600a](after/generator-600a.json) | 58.85 / 66.57 | 59.97 | 12.61 / 45.06 | 0.20 | 19.31 | Invalid (generator); SLO met |

Every passing run delivered all expected recipient events with zero missing, duplicate, or wrong-room deliveries. A first 450a attempt on the before side ended when the generator's summary step overflowed the call stack (fixed in `260e787`); it is not included. [`benchmark-results.test.mjs`](benchmark-results.test.mjs) re-derives each verdict and the CPU reduction from the JSON files.
