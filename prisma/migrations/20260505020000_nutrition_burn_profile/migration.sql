-- Body profile for BMR (Mifflin-St Jeor) + active energy burned column on
-- the existing nutrition log. All fields are nullable so existing rows /
-- users keep working unchanged; the Nutrition page hides burn / deficit
-- stats until profile + history are sufficient.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "heightCm"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "dateOfBirth"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "biologicalSex" TEXT;

ALTER TABLE "DailyNutritionLog"
  ADD COLUMN IF NOT EXISTS "activeEnergyKcal" DOUBLE PRECISION;
