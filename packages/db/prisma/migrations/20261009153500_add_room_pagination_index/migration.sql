-- DropIndex
DROP INDEX "rooms_status_created_at_idx";

-- CreateIndex
CREATE INDEX "rooms_status_created_at_id_idx" ON "rooms"("status", "created_at", "id");
