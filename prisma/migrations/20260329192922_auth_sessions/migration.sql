/*
  Warnings:

  - You are about to drop the column `averageCadenceSpm` on the `StravaActivity` table. All the data in the column will be lost.
  - The `User` table already has rows. This migration backfills required auth fields.

*/
-- AlterTable
ALTER TABLE "StravaActivity" DROP COLUMN "averageCadenceSpm";

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- Backfill existing placeholder user row(s) created before auth existed.
-- NOTE: This sets a default login:
--   email:    me@local
--   password: changeme
UPDATE "User"
SET
  "email" = COALESCE("email", 'me@local'),
  "passwordHash" = COALESCE(
    "passwordHash",
    '$2b$12$sA2h9pQlihVBEJSw.1eC1.YD6iMKgG8XhsZr6zlDj9ejj5BULwajG'
  );

ALTER TABLE "User"
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "passwordHash" SET NOT NULL;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
