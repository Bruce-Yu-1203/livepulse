ALTER TABLE "users" ADD COLUMN "username" VARCHAR(30);
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

CREATE TABLE "registration_challenges" (
    "email" VARCHAR(320) NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_sent_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "registration_challenges_pkey" PRIMARY KEY ("email")
);

CREATE INDEX "registration_challenges_expires_at_idx" ON "registration_challenges"("expires_at");
