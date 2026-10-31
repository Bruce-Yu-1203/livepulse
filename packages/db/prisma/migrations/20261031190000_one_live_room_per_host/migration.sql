-- A host broadcasts in at most one room at a time. Older demo data gave one
-- host several live rooms, so end all but the most recently started one first.
UPDATE "rooms" AS "room"
SET
  "status" = 'ENDED',
  "version" = "room"."version" + 1,
  "updated_at" = CURRENT_TIMESTAMP
FROM (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "host_id"
      ORDER BY "started_at" DESC NULLS LAST, "created_at" DESC, "id" DESC
    ) AS "rank"
  FROM "rooms"
  WHERE "status" = 'LIVE'
) AS "ranked"
WHERE "room"."id" = "ranked"."id" AND "ranked"."rank" > 1;

-- CreateIndex
CREATE UNIQUE INDEX "rooms_one_live_per_host_key" ON "rooms"("host_id") WHERE (status = 'LIVE');
