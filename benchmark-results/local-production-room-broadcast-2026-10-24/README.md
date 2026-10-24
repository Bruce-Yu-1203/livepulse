# Production room broadcast: local 400/400 comparison (2026-10-24)

## Change and workload

The production realtime hub now joins an authorized local socket to its Socket.IO room and broadcasts `message.created` to that room. Redis still distributes each event to API instances, and every instance broadcasts only to its own connected clients. Persistence, sender ACK semantics, and other event types remain on the existing path.

The workload was one live room, 400 authenticated WebSocket connections, and 400 messages/second for 30 seconds. Each run sent 400 warm-up messages followed by 12,000 measured messages. The API and load generator ran as separate processes on the same machine with the same isolated local PostgreSQL database and Redis key prefix used for the earlier baseline. Each timed run used fresh API and generator processes. ACK latency is `message.send` to the sender's `message.created` event.

| Implementation | Run | ACK p50 | ACK p95 | ACK p99 | ACKs in 30 s | Total accepted | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Previous per-peer loop | 1 | 1,819.48 ms | 4,339.62 ms | 4,427.30 ms | 10,419 | 12,000 | 0 |
| Previous per-peer loop | 2 | 3,285.82 ms | 4,676.99 ms | 4,718.65 ms | 10,176 | 12,000 | 0 |
| Production Socket.IO rooms | 1 | 9.95 ms | 22.92 ms | 38.49 ms | 11,997 | 12,000 | 0 |
| Production Socket.IO rooms | 2 | 14.04 ms | 26.53 ms | 39.29 ms | 11,990 | 12,000 | 0 |

The two local run pairs show about 189x and 176x lower ACK p95, respectively. The in-window ACK rate rose from 347.3 and 339.2 per second to 399.9 and 399.7 per second. The old runs needed 33.97 and 34.31 seconds to receive all sender ACKs; both production room runs finished in 30.01 seconds. PostgreSQL insert wrapper p95 fell from 861.87 and 1,101.77 ms to 4.20 and 5.31 ms; this wrapper includes waiting and is not a measurement of PostgreSQL engine time alone.

## Correctness and delivery

Unit and database integration tests cover authorization before room admission, leaving, reconnecting, and delivery across two API instances. A separate smoke test launched two independent API operating-system processes on ports 3101 and 3102 against the same Redis and database. It verified one cross-process receipt on each joined client, no receipt on an unjoined client, no receipt after leaving, and one receipt after reconnecting. The JSON result is `livepulse-two-process-delivery.json`. This smoke test covers three messages, not a sustained multi-process load.

A separate production-code diagnostic run enabled delivery counting: all 12,000 messages were accepted, with zero failures and exactly 4,800,000 client deliveries. Every one of the 400 clients received 12,000 messages. That diagnostic run had 31.58 ms ACK p95, but its timing is excluded from the comparison because delivery counting adds client work.

`pnpm validate` and the realtime database integration test passed. Raw JSON files in this directory contain the two production API/generator pairs and the delivery diagnostic. The previous per-peer raw data is in `benchmark-results/local-broadcast-comparison-2026-10-24/`.

These results measure a shared local machine. They support the implementation comparison under this workload; they do not establish deployed capacity or a production service level objective.
