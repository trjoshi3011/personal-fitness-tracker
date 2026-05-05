-- DailyNutritionLog table + NutritionSource enum.
-- Stores one row per (userId, date, source). BACKFILL beats MANUAL on shared days at read time.

CREATE TYPE "NutritionSource" AS ENUM ('BACKFILL', 'MANUAL');

CREATE TABLE "DailyNutritionLog" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "date"          TIMESTAMP(3) NOT NULL,
  "source"        "NutritionSource" NOT NULL,
  "caloriesKcal"  DOUBLE PRECISION,
  "proteinG"      DOUBLE PRECISION,
  "carbsG"        DOUBLE PRECISION,
  "fatG"          DOUBLE PRECISION,
  "fiberG"        DOUBLE PRECISION,
  "sugarG"        DOUBLE PRECISION,
  "sodiumMg"      DOUBLE PRECISION,
  "saturatedFatG" DOUBLE PRECISION,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DailyNutritionLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyNutritionLog_userId_date_source_key"
  ON "DailyNutritionLog"("userId", "date", "source");

CREATE INDEX "DailyNutritionLog_userId_date_idx"
  ON "DailyNutritionLog"("userId", "date");

CREATE INDEX "DailyNutritionLog_userId_source_date_idx"
  ON "DailyNutritionLog"("userId", "source", "date");

ALTER TABLE "DailyNutritionLog"
  ADD CONSTRAINT "DailyNutritionLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same RLS pattern as ManualWeightLog: superusers (Prisma) bypass RLS so app
-- behaviour is unchanged; this just suppresses Supabase advisor flags.
ALTER TABLE "DailyNutritionLog" ENABLE ROW LEVEL SECURITY;
