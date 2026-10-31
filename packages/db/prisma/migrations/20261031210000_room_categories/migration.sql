-- Every room belongs to exactly one category. Existing rooms default to
-- Just Chatting. The slug list mirrors roomCategories in @livepulse/contracts.
ALTER TABLE "rooms" ADD COLUMN "category" VARCHAR(32) NOT NULL DEFAULT 'just-chatting';

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_category_check" CHECK (
  "category" IN (
    'just-chatting',
    'irl',
    'gaming',
    'music',
    'art',
    'tech',
    'study',
    'food',
    'sports'
  )
);

-- CreateIndex
CREATE INDEX "rooms_category_status_created_at_id_idx" ON "rooms"("category", "status", "created_at", "id");
