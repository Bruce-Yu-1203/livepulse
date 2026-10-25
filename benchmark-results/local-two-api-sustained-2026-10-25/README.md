# Local sustained load across two API processes (2026-10-25)

## Question and workload

This run checks whether the production Socket.IO room broadcast path can sustain 400 incoming messages/second with clients split across two independent API operating-system processes. Both processes use the same isolated local PostgreSQL database and Redis namespace. The load generator, both APIs, PostgreSQL, and Redis share one computer.

Each measured run has one live room, 400 authenticated WebSocket clients, 400 messages/second for 60 seconds, 400 warm-up messages, and 24,000 measured messages. The two-process generator connects 200 clients to each API and sends 12,000 messages through each. Redis distributes every created event to both APIs; each API broadcasts it to its own 200 local clients. The expected total is 24,000 × 400 = 9,600,000 client deliveries.

ACK latency runs from `message.send` until the originating client receives `message.created`. The timed run does not count every received event. A separate 60-second diagnostic checks full delivery, since per-event counting adds load to the generator. The single-process control uses the same 60-second workload and machine.

## Timed results

| Mode | ACK p50 | ACK p95 | ACK p99 | ACKs within 60 s | Total accepted | Failures | Generator dispatch lag p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| One API process, 400 clients | 17.01 ms | 68.18 ms | 108.60 ms | 23,992 | 24,000 | 0 | 2.55 ms |
| Two API processes, 200 clients each | 6.85 ms | 47.02 ms | 160.47 ms | 23,998 | 24,000 | 0 | 5.72 ms |

The two-process run sent all 24,000 messages inside the 60-second window. Each API accepted 12,000, with ACK p95 of 44.57 and 49.25 ms. Its per-process `hubHandleMs` p95 was 19.46 and 20.81 ms, versus 36.30 ms in the single-process control. The two APIs used a combined 71.42 CPU-seconds over the 60-second run; the single API used 62.45 CPU-seconds. The generator's dispatch lag p95 was higher with two APIs, showing some extra local-machine scheduling pressure.

| Seconds since start | One API ACK p95 | Two APIs ACK p95 | Two-API messages sent |
| ---: | ---: | ---: | ---: |
| 0–10 | 91.13 ms | 72.73 ms | 4,000 |
| 10–20 | 49.92 ms | 26.01 ms | 4,001 |
| 20–30 | 49.38 ms | 53.70 ms | 3,997 |
| 30–40 | 39.24 ms | 156.50 ms | 4,002 |
| 40–50 | 101.93 ms | 21.60 ms | 4,000 |
| 50–60 | 32.85 ms | 14.60 ms | 4,000 |

Both configurations completed the configured average input rate without a persistent rise in ACK latency across the minute. The individual windows varied substantially, including a 30–40 second spike in the two-process run. The two-process p95 was lower in this one timed comparison, while its p99 and combined API CPU were higher. These data establish sustained completion under this local workload; one run per configuration is insufficient to claim a general scaling improvement.

## Full delivery diagnostic

The separate two-process 60-second run accepted all 24,000 messages with zero failures. Its per-client message-index check found 9,600,000 expected and unique received deliveries, zero missing, zero duplicates, zero wrong-room deliveries, and exactly 24,000 unique messages on each of the 400 clients. The diagnostic run's ACK p95 was 29.89 ms and is excluded from the timed comparison because the generator did extra verification work.

The benchmark support and delivery verifier passed `pnpm validate` (371 tests, plus lint, formatting, type checking, and build). Raw JSON reports for both API processes, the generator, the diagnostic run, and the single-process control are in this directory. Earlier 30-second single-process runs are in `benchmark-results/local-production-room-broadcast-2026-10-24/`.
