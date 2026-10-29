CREATE TABLE "message_tombstones" (
    "message_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "message_tombstones_pkey" PRIMARY KEY ("message_id")
);

CREATE INDEX "message_tombstones_expires_at_idx" ON "message_tombstones"("expires_at");
