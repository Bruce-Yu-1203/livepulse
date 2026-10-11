CREATE TABLE "room_mutes" (
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "muted_by" UUID NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "room_mutes_pkey" PRIMARY KEY ("room_id", "user_id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "target_id" UUID NOT NULL,
    "room_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "room_mutes_expires_at_idx" ON "room_mutes"("expires_at");
CREATE INDEX "room_mutes_user_id_idx" ON "room_mutes"("user_id");
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");
CREATE INDEX "audit_logs_room_id_created_at_idx" ON "audit_logs"("room_id", "created_at");

ALTER TABLE "room_mutes"
ADD CONSTRAINT "room_mutes_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "rooms"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "room_mutes"
ADD CONSTRAINT "room_mutes_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
