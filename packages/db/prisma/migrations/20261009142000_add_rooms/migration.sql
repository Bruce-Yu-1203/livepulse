-- CreateEnum
CREATE TYPE "room_status" AS ENUM ('DRAFT', 'LIVE', 'ENDED');

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "cover_image_url" VARCHAR(2048) NOT NULL,
    "demo_video_url" VARCHAR(2048) NOT NULL,
    "status" "room_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rooms_host_id_idx" ON "rooms"("host_id");

-- CreateIndex
CREATE INDEX "rooms_status_created_at_idx" ON "rooms"("status", "created_at");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
