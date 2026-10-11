CREATE TYPE "report_reason" AS ENUM (
    'SPAM',
    'HARASSMENT',
    'HATE_SPEECH',
    'OTHER'
);

CREATE TYPE "report_status" AS ENUM (
    'PENDING',
    'ACTIONED',
    'DISMISSED'
);

CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "reason" "report_reason" NOT NULL,
    "details" VARCHAR(500),
    "status" "report_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reports_reporter_id_message_id_key"
ON "reports"("reporter_id", "message_id");
CREATE INDEX "reports_room_id_message_id_idx"
ON "reports"("room_id", "message_id");
CREATE INDEX "reports_status_created_at_idx"
ON "reports"("status", "created_at");

ALTER TABLE "reports"
ADD CONSTRAINT "reports_reporter_id_fkey"
FOREIGN KEY ("reporter_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reports"
ADD CONSTRAINT "reports_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "rooms"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
