-- AlterTable
ALTER TABLE "WhoopWorkout" ADD COLUMN "liftSessionTemplate" "LiftSessionTemplate";

-- Backfill from legacy logs that linked a WHOOP workout (one log per workout wins: latest by sessionAt)
UPDATE "WhoopWorkout" w
SET "liftSessionTemplate" = sub."template"
FROM (
  SELECT DISTINCT ON ("whoopWorkoutId") "whoopWorkoutId", "template"
  FROM "LiftSessionLog"
  WHERE "whoopWorkoutId" IS NOT NULL
  ORDER BY "whoopWorkoutId", "sessionAt" DESC
) sub
WHERE w."id" = sub."whoopWorkoutId"
  AND w."liftSessionTemplate" IS NULL;
