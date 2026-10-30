#!/usr/bin/env bash
# Run one local direct-vs-Kafka pipeline benchmark with fault injection.
#
# Usage: run-pipeline-benchmark.sh outage|burst direct|kafka RUN_ID OUTPUT_DIR
#
# outage: one room, 200 connections at 200 msg/s for 180 s; at t=60 s a
#         separate session holds SHARE lock on danmaku_messages for 40 s.
# burst:  ten rooms, generator A at 200 msg/s for 180 s plus generator B with
#         a different source account at 400 msg/s for 30 s starting at t=60 s.
#
# Every run uses a fresh clone of the benchmark template, a unique Redis key
# prefix, and in Kafka mode a fresh 12-partition topic and consumer groups.
set -euo pipefail

test_name=${1:-}
mode=${2:-}
run_id=${3:-}
output_dir=${4:-}
if [[ ! $test_name =~ ^(outage|burst)$ || ! $mode =~ ^(direct|kafka)$ ||
  ! $run_id =~ ^[a-z0-9]+$ || -z $output_dir ]]; then
  echo 'Usage: run-pipeline-benchmark.sh outage|burst direct|kafka RUN_ID OUTPUT_DIR' >&2
  exit 2
fi

repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$repo_root"
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)

template=${BENCHMARK_TEMPLATE:-livepulse_benchmark_template_20261030}
fault_at_seconds=${BENCHMARK_FAULT_AT_SECONDS:-60}
outage_seconds=${BENCHMARK_OUTAGE_SECONDS:-40}
duration_seconds=${BENCHMARK_DURATION_SECONDS:-180}
stamp=$(date +%Y%m%d%H%M%S)
id="${test_name}-${mode}-${run_id}"
database="livepulse_benchmark_kp_${test_name}_${mode}_${run_id}_${stamp}"
api_port=${BENCHMARK_API_PORT:-3121}
events_file="$output_dir/events-$id.txt"
pids=(0)

# BSD date has no millisecond format, so read the clock through Perl.
now_ms() { perl -MTime::HiRes=time -e 'printf "%d\n", time * 1000'; }
pg() { docker exec -i livepulse-postgres-1 psql -U livepulse -v ON_ERROR_STOP=1 -q "$@"; }
mark() { echo "$1" >>"$events_file"; echo "$(now_ms) $1" >&2; }
cleanup() {
  # The leading 0 placeholder keeps the array non-empty for bash 3.2 with set -u.
  for pid in "${pids[@]}"; do
    ((pid > 0)) && kill -TERM "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

pg -d postgres -c "CREATE DATABASE $database TEMPLATE $template"
: >"$events_file"

export DATABASE_URL="postgresql://livepulse:livepulse_dev_password@127.0.0.1:5432/$database?schema=public"
export REDIS_URL='redis://127.0.0.1:6379'
export REDIS_KEY_PREFIX="livepulse-benchmark-kp-$id-$stamp"
export BETTER_AUTH_URL="http://localhost:$api_port"
export BENCHMARK_API_ORIGIN="http://127.0.0.1:$api_port"
export MESSAGE_PIPELINE=$mode
if [[ $mode == kafka ]]; then
  export KAFKA_BROKERS='localhost:9094'
  export KAFKA_MESSAGES_TOPIC="livepulse.benchmark.kp.$id.$stamp"
  export KAFKA_BROADCAST_GROUP="livepulse-broadcast-kp-$id-$stamp"
  export KAFKA_PERSISTENCE_GROUP="livepulse-persist-kp-$id-$stamp"
  docker exec livepulse-kafka-1 /opt/kafka/bin/kafka-topics.sh \
    --bootstrap-server localhost:9092 --create --topic "$KAFKA_MESSAGES_TOPIC" \
    --partitions 12 --replication-factor 1 >/dev/null
fi

rooms='44444444-4444-4444-8444-444444444444'
if [[ $test_name == burst ]]; then
  rooms+=',55555555-5555-4555-8555-000000000001,55555555-5555-4555-8555-000000000002'
  rooms+=',55555555-5555-4555-8555-000000000003,55555555-5555-4555-8555-000000000004'
  rooms+=',55555555-5555-4555-8555-000000000005,55555555-5555-4555-8555-000000000006'
  rooms+=',55555555-5555-4555-8555-000000000007,55555555-5555-4555-8555-000000000008'
  rooms+=',55555555-5555-4555-8555-000000000009'
fi

cat >"$output_dir/meta-$id.json" <<JSON
{
  "test": "$test_name",
  "mode": "$mode",
  "run": "$run_id",
  "database": "$database",
  "redisKeyPrefix": "$REDIS_KEY_PREFIX",
  "kafkaTopic": "${KAFKA_MESSAGES_TOPIC:-}",
  "kafkaBroadcastGroup": "${KAFKA_BROADCAST_GROUP:-}",
  "kafkaPersistenceGroup": "${KAFKA_PERSISTENCE_GROUP:-}",
  "postgresNanoCpus": $(docker inspect livepulse-postgres-1 --format '{{.HostConfig.NanoCpus}}'),
  "applicationCommit": "$(git rev-parse --short HEAD)",
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

node --env-file=.env apps/api/scripts/benchmark-realtime-server.mjs \
  >"$output_dir/api-$id.json" 2>"$output_dir/api-$id.log" &
api_pid=$!
pids+=("$api_pid")
until grep -q 'Benchmark API ready' "$output_dir/api-$id.log"; do
  kill -0 "$api_pid" || { cat "$output_dir/api-$id.log" >&2; exit 1; }
  sleep 0.5
done

if [[ $mode == kafka ]]; then
  for role in broadcast persistence; do
    node --env-file=.env "apps/api/dist/messages/$role-main.js" \
      >"$output_dir/worker-$role-$id.log" 2>&1 &
    pids+=("$!")
  done
  until grep -q 'subscribed' "$output_dir/worker-broadcast-$id.log" &&
    grep -q 'subscribed' "$output_dir/worker-persistence-$id.log"; do
    sleep 0.5
  done
  # Allow both consumer groups to finish their first rebalance.
  sleep 8
fi

BENCHMARK_SAMPLER_EVENTS_FILE=$events_file \
  node --env-file=.env apps/api/scripts/benchmark-pipeline-sampler.mjs \
  >"$output_dir/sampler-$id.csv" 2>"$output_dir/sampler-$id.log" &
sampler_pid=$!
pids+=("$sampler_pid")

BENCHMARK_EXTERNAL_API=1 \
  BENCHMARK_PROFILE_PID=$api_pid \
  BENCHMARK_ROOM_IDS=$rooms \
  BENCHMARK_CONNECTIONS=200 \
  BENCHMARK_MESSAGES_PER_SECOND=200 \
  BENCHMARK_DURATION_SECONDS=$duration_seconds \
  BENCHMARK_VERIFY_DELIVERIES=${BENCHMARK_VERIFY_DELIVERIES:-1} \
  node --env-file=.env apps/api/scripts/benchmark-realtime.mjs \
  >"$output_dir/generator-a-$id.json" 2>"$output_dir/generator-a-$id.log" &
generator_a_pid=$!
pids+=("$generator_a_pid")
until grep -q 'Benchmark window started' "$output_dir/generator-a-$id.log"; do
  kill -0 "$generator_a_pid" || { cat "$output_dir/generator-a-$id.log" >&2; exit 1; }
  sleep 0.2
done
window_ms=$(sed -n 's/.*epochMs=\([0-9]*\).*/\1/p' "$output_dir/generator-a-$id.log")
fault_ms=$((window_ms + fault_at_seconds * 1000))
mark "window_start"

sleep_until() {
  local delay_ms=$(($1 - $(now_ms)))
  if ((delay_ms > 0)); then sleep "$(printf '%d.%03d' $((delay_ms / 1000)) $((delay_ms % 1000)))"; fi
}

generator_b_pid=
if [[ $test_name == outage ]]; then
  sleep_until "$fault_ms"
  mark "fault_start"
  pg -d "$database" <<SQL
BEGIN;
LOCK TABLE danmaku_messages IN SHARE MODE;
SELECT pg_sleep($outage_seconds);
COMMIT;
SQL
  mark "fault_end"
else
  BENCHMARK_EXTERNAL_API=1 \
    BENCHMARK_EMAIL=${BENCHMARK_BURST_EMAIL:-host@livepulse.local} \
    BENCHMARK_MESSAGE_LABEL=burst \
    BENCHMARK_START_AT_EPOCH_MS=$fault_ms \
    BENCHMARK_ROOM_IDS=$rooms \
    BENCHMARK_CONNECTIONS=400 \
    BENCHMARK_MESSAGES_PER_SECOND=400 \
    BENCHMARK_DURATION_SECONDS=${BENCHMARK_BURST_SECONDS:-30} \
    BENCHMARK_VERIFY_DELIVERIES=${BENCHMARK_VERIFY_DELIVERIES:-1} \
    node --env-file=.env apps/api/scripts/benchmark-realtime.mjs \
    >"$output_dir/generator-b-$id.json" 2>"$output_dir/generator-b-$id.log" &
  generator_b_pid=$!
  pids+=("$generator_b_pid")
  sleep_until "$fault_ms"
  mark "burst_start"
  sleep_until $((fault_ms + ${BENCHMARK_BURST_SECONDS:-30} * 1000))
  mark "burst_end"
fi

wait "$generator_a_pid"
[[ -n $generator_b_pid ]] && wait "$generator_b_pid"
mark "generators_done"

# Wait until persistence has drained: Kafka lag zero, or a stable row count.
stable=0
last_rows=
for _ in $(seq 1 240); do
  sleep 1
  line=$(tail -n 1 "$output_dir/sampler-$id.csv")
  rows=$(cut -d, -f3 <<<"$line")
  persistence_lag=$(cut -d, -f8 <<<"$line")
  broadcast_lag=$(cut -d, -f9 <<<"$line")
  if [[ $mode == kafka ]]; then
    [[ $persistence_lag == 0 && $broadcast_lag == 0 ]] && stable=$((stable + 1)) || stable=0
  else
    [[ $rows == "$last_rows" ]] && stable=$((stable + 1)) || stable=0
  fi
  last_rows=$rows
  ((stable >= 5)) && break
done
mark "drained"
sleep 2

kill -INT "$sampler_pid"
wait "$sampler_pid" || true
wait "$api_pid" || true
cleanup

generator_files=("$output_dir/generator-a-$id.json")
[[ -n $generator_b_pid ]] && generator_files+=("$output_dir/generator-b-$id.json")
node --env-file=.env apps/api/scripts/benchmark-pipeline-analysis.mjs \
  "$output_dir/sampler-$id.csv" "${generator_files[@]}" \
  >"$output_dir/summary-$id.json"
echo "Finished $id: $output_dir/summary-$id.json" >&2
