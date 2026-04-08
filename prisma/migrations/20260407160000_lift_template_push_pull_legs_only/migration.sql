-- Remap legacy enum value before altering type
UPDATE "LiftSessionLog" SET "template" = 'PUSH' WHERE "template"::text = 'FULL_BODY';
UPDATE "WhoopWorkout" SET "liftSessionTemplate" = NULL WHERE "liftSessionTemplate"::text = 'FULL_BODY';

ALTER TABLE "LiftSplitWeeklyTarget" DROP COLUMN IF EXISTS "fullBodyTarget";

CREATE TYPE "LiftSessionTemplate_new" AS ENUM ('PUSH', 'PULL', 'LEGS');

ALTER TABLE "WhoopWorkout" ALTER COLUMN "liftSessionTemplate" TYPE "LiftSessionTemplate_new"
  USING ("liftSessionTemplate"::text::"LiftSessionTemplate_new");

ALTER TABLE "LiftSessionLog" ALTER COLUMN "template" TYPE "LiftSessionTemplate_new"
  USING ("template"::text::"LiftSessionTemplate_new");

DROP TYPE "LiftSessionTemplate";
ALTER TYPE "LiftSessionTemplate_new" RENAME TO "LiftSessionTemplate";
