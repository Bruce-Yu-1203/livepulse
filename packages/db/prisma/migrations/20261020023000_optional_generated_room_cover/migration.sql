ALTER TABLE "rooms"
  ALTER COLUMN "cover_image_url" DROP NOT NULL,
  ALTER COLUMN "cover_image_url" TYPE TEXT;

ALTER TABLE "rooms" DROP COLUMN "demo_video_url";
