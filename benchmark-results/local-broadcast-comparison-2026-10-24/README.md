# Local broadcast implementation comparison (2026-10-24)

## Workload and measurement

- One live room, 400 authenticated WebSocket connections, 400 messages/second for 30 seconds: 12,000 measurement messages plus 400 warm-up messages per run.
- Isolated local PostgreSQL database and Redis key prefix. The API and generator ran as separate processes on the same machine. Each row is a fresh API and generator process. Runs alternated between the existing per-peer send loop and the benchmark-only Socket.IO room broadcast mode.
- ACK latency measures `message.send` to the sender's `message.created` event, including persistence, publication, and fanout. `acceptedDuringWindow` counts ACKs received inside the 30-second target window; `acceptedMessages` includes ACKs arriving during drain.
- The two timed runs per mode did not enable delivery counting. Separate diagnostic runs enabled `BENCHMARK_VERIFY_DELIVERIES=1`, which adds client-side work and is not used for the latency comparison.

| Mode | Run | ACK p50 | ACK p95 | ACK p99 | ACKs in 30 s | Total accepted | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Per-peer loop | 1 | 1,819.48 ms | 4,339.62 ms | 4,427.30 ms | 10,419 | 12,000 | 0 |
| Socket.IO room | 1 | 12.46 ms | 60.05 ms | 196.98 ms | 11,996 | 12,000 | 0 |
| Per-peer loop | 2 | 3,285.82 ms | 4,676.99 ms | 4,718.65 ms | 10,176 | 12,000 | 0 |
| Socket.IO room | 2 | 13.09 ms | 34.43 ms | 70.77 ms | 11,994 | 12,000 | 0 |

In these local runs, room broadcast reduced sender ACK p95 by roughly 72x and 136x in the respective pairs. The per-peer runs took 33.97 and 34.31 seconds to drain all sender ACKs; room broadcast completed in 30.01 seconds. The standalone API's `postgresInsertMs` p95 was 861.87 and 1,101.77 ms in per-peer runs, versus 9.63 and 5.93 ms in room runs. Those timings include waiting for the operation, so they do not establish PostgreSQL itself as the cause. The combined evidence is consistent with the per-peer fanout path saturating the API process and delaying unrelated async work.

## Delivery equivalence check

Both diagnostic runs accepted all 12,000 messages with zero failures. Each had 4,800,000 expected and received client events, and every one of the 400 clients received exactly 12,000 measurement messages. The diagnostic run's ACK p95 was 3,585.39 ms for the per-peer loop and 24.99 ms for Socket.IO room broadcast. These timings are not part of the A/B latency comparison because counting each event adds generator work.

The room broadcast implementation is confined to `benchmark-realtime-server.mjs` behind `BENCHMARK_NATIVE_ROOM_BROADCAST=1`; the production realtime hub has not been changed. The comparison demonstrates a promising local optimization, subject to a production implementation and tests for room admission, leave, reconnect, authorization, and multi-process delivery before claiming a product improvement. These figures are local-machine results and do not predict staging or production capacity.

Raw JSON files in this directory contain each timed API/generator pair and the two delivery diagnostic generator reports.
