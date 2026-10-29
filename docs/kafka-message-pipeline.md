# Kafka message pipeline

The Gateway validates authentication, room membership and status, mute state, content, and rate limits before publishing a room message. A successful Kafka `acks=all` response triggers a `message.created` acknowledgement to the sender. The sender can see the message immediately; message history becomes available after the persistence worker commits it.

```text
Gateway -> livepulse.messages.v1 (key = roomId)
                          |-> livepulse-broadcast-v1 -> Redis Pub/Sub -> Socket.IO
                          |-> livepulse-persist-v1   -> PostgreSQL
```

The consumer groups have independent offsets. Each worker commits a batch's offset after its side effect succeeds. Redis atomically publishes and records a seven-day broadcast deduplication key. PostgreSQL stores the Kafka partition and offset and ignores a replay with the same payload hash. A moderation tombstone protects a message deleted before the persistence worker reaches it. Redis Pub/Sub remains best effort for connected clients; message history is the recovery path after reconnect.

The message topic is keyed by `roomId` to preserve order within a room. A single hot room is limited by one partition; adding broadcast replicas helps when traffic is spread across rooms. The local topic has 12 partitions and seven-day retention. Production should use at least three brokers, replication factor 3, minimum in-sync replicas 2, and `acks=all` for broker failure tolerance. The Railway single-node Kafka template is suitable for development or staging, with a persistent volume.

## Railway setup

1. Provision Kafka and create `livepulse.messages.v1` with 12 partitions and at least seven-day retention. For a single-node staging broker, use replication factor 1; for a production cluster, use 3. Disable automatic topic creation. Use the broker's advertised listener addresses; a bootstrap address that advertises an unreachable hostname will fail after initial connection.
2. Apply the database migration (`pnpm --filter @livepulse/db exec prisma migrate deploy --config prisma7.config.ts`) using the Railway `DATABASE_URL` before changing the Gateway.
3. Create two new Railway services from the same repository, with root directory at the repository root and `RAILWAY_DOCKERFILE_PATH=infra/compose/Dockerfile`. The Dockerfile's final stage is the API image. Set the broadcast service start command to `node apps/api/dist/messages/broadcast-main.js` and the persistence service start command to `node apps/api/dist/messages/persistence-main.js`. Neither worker needs a public domain or HTTP health check.
4. Configure the services as below. Deploy both workers and confirm their logs say `worker subscribed` before enabling `MESSAGE_PIPELINE=kafka` on the existing API service. The API retains its existing start command and public domain.

| Variable | API | Broadcast worker | Persistence worker |
| --- | --- | --- | --- |
| `KAFKA_BROKERS` | Required | Required | Required |
| `KAFKA_MESSAGES_TOPIC` | `livepulse.messages.v1` | Same | Same |
| `KAFKA_CLIENT_ID` | `livepulse-api` | `livepulse-broadcast` | `livepulse-persist` |
| `KAFKA_SSL`, `KAFKA_SASL_MECHANISM`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD` | As required by broker | Same | Same |
| `REDIS_URL`, `REDIS_KEY_PREFIX` | Existing values | Same values | Not required |
| `DATABASE_URL` | Existing value | Not required | Same database |
| `MESSAGE_PIPELINE` | `kafka` after workers are ready | Not required | Not required |
| `KAFKA_BROADCAST_GROUP` | Not required | `livepulse-broadcast-v1` | Not required |
| `KAFKA_PERSISTENCE_GROUP` | Not required | Not required | `livepulse-persist-v1` |

For Kafka hosted as a service in the same Railway project, use the private DNS address in `KAFKA_BROKERS`, for example `${{Kafka.RAILWAY_PRIVATE_DOMAIN}}:9092` if the service is named `Kafka`. Do not use the public TCP proxy from other Railway services. For a managed external broker, use its bootstrap server list and enable its TLS/SASL settings. `KAFKA_BROKERS` is comma separated; do not include `kafka://`.

The API still needs its normal auth, Redis, database, and web origin variables. The persistence worker only needs database and Kafka variables; the broadcast worker only needs Redis and Kafka variables. Both consumer groups must keep stable, distinct names across deployments. Do not reuse a group name between them.

Monitor the `broadcast lag topic[partition]=N` and `persistence lag topic[partition]=N` logs. Persistent broadcast lag means viewers will see delayed messages even if the sender received an acknowledgement. Scale broadcast replicas up to the topic's partition count, or increase broker/Redis capacity. A hot room cannot be split without changing the ordering contract. On worker failure, uncommitted records replay. If Kafka is unavailable, the API rejects new sends with `SERVICE_UNAVAILABLE` rather than claiming they were accepted.

To roll back the Gateway while troubleshooting, set `MESSAGE_PIPELINE=direct`. Keep both workers running until their lag reaches zero so already accepted Kafka messages finish. The direct path continues to write PostgreSQL before Redis fan-out.

## Local verification

`docker compose -f infra/compose/compose.yml up --build -d --wait` starts a single-node Kafka broker, creates the topic, and runs both workers. The broker is reachable from the host at `localhost:9094` and within Compose at `kafka:9092`. The API's Compose configuration enables Kafka automatically; `.env.example` defaults to direct mode for a separately started API.

After building the API, run the dedicated Kafka test against a disposable database:

```bash
DATABASE_URL='postgresql://livepulse:livepulse_dev_password@localhost:5432/livepulse_test?schema=public' \
REDIS_URL='redis://localhost:6379' KAFKA_BROKERS='localhost:9094' \
pnpm --filter @livepulse/api test:kafka
```
