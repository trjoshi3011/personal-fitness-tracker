-- User-entered weight measurements. Complements WHOOP weights (or stands in
-- when WHOOP isn't connected). One row per (userId, date).
CREATE TABLE "ManualWeightLog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "weightKg" DOUBLE PRECISION NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManualWeightLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ManualWeightLog_userId_date_key"
  ON "ManualWeightLog" ("userId", "date");

CREATE INDEX "ManualWeightLog_userId_date_idx"
  ON "ManualWeightLog" ("userId", "date");
