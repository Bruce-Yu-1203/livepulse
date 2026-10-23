CREATE TABLE "user_follows" (
  "follower_id" UUID NOT NULL,
  "followed_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_follows_pkey" PRIMARY KEY ("follower_id", "followed_id"),
  CONSTRAINT "user_follows_no_self_follow" CHECK ("follower_id" <> "followed_id")
);

CREATE INDEX "user_follows_followed_id_created_at_idx" ON "user_follows"("followed_id", "created_at" DESC);
CREATE INDEX "user_follows_follower_id_created_at_idx" ON "user_follows"("follower_id", "created_at" DESC);

ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followed_id_fkey" FOREIGN KEY ("followed_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
