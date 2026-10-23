ALTER TABLE "rooms" ADD COLUMN "started_at" TIMESTAMPTZ(3);

UPDATE "rooms"
SET "started_at" = "created_at"
WHERE "status" IN ('LIVE', 'ENDED');
