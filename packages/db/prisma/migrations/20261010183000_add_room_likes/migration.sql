CREATE TABLE "room_likes" (
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_likes_pkey" PRIMARY KEY ("room_id", "user_id")
);

CREATE INDEX "room_likes_user_id_idx" ON "room_likes"("user_id");

ALTER TABLE "room_likes"
ADD CONSTRAINT "room_likes_room_id_fkey"
FOREIGN KEY ("room_id") REFERENCES "rooms"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "room_likes"
ADD CONSTRAINT "room_likes_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
