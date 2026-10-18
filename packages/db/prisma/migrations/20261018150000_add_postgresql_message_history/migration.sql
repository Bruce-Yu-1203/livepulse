CREATE TABLE "danmaku_messages" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "client_message_id" UUID NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "kafka_partition" INTEGER,
    "kafka_offset" BIGINT,
    "deleted_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "danmaku_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "danmaku_messages_room_id_author_id_client_message_id_key"
ON "danmaku_messages"("room_id", "author_id", "client_message_id");

CREATE INDEX "danmaku_messages_room_id_accepted_at_id_idx"
ON "danmaku_messages"("room_id", "accepted_at" DESC, "id" DESC);

CREATE INDEX "danmaku_messages_expires_at_idx"
ON "danmaku_messages"("expires_at");

ALTER TABLE "danmaku_messages"
ADD CONSTRAINT "danmaku_messages_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "rooms"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "danmaku_messages"
ADD CONSTRAINT "danmaku_messages_author_id_fkey"
FOREIGN KEY ("author_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
