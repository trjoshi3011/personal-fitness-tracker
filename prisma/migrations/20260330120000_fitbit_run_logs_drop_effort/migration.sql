-- Remove Strava effort columns (no longer used in UI).
ALTER TABLE "StravaActivity" DROP COLUMN IF EXISTS "sufferScore";
ALTER TABLE "StravaActivity" DROP COLUMN IF EXISTS "kilojoules";

-- Remove unused monthly rollup columns.
ALTER TABLE "MonthlyFitnessSnapshot" DROP COLUMN IF EXISTS "avgSufferScore";
ALTER TABLE "MonthlyFitnessSnapshot" DROP COLUMN IF EXISTS "totalKilojoules";

-- Fitbit exercise logs (e.g. device / MobileRun) for runs before Strava had them.
CREATE TABLE "FitbitActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "activityName" TEXT,
    "activityTypeId" INTEGER,
    "startAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER,
    "distanceMeters" INTEGER,
    "elevationGainM" DOUBLE PRECISION,
    "averageHeartRateBpm" INTEGER,
    "maxHeartRateBpm" INTEGER,
    "calories" INTEGER,
    "logType" TEXT,
    "rawPayload" JSONB,
    "sourceConnectedAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitbitActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FitbitActivityLog_userId_logId_key" ON "FitbitActivityLog"("userId", "logId");
CREATE INDEX "FitbitActivityLog_userId_startAt_idx" ON "FitbitActivityLog"("userId", "startAt");
CREATE INDEX "FitbitActivityLog_startAt_idx" ON "FitbitActivityLog"("startAt");

ALTER TABLE "FitbitActivityLog" ADD CONSTRAINT "FitbitActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FitbitActivityLog" ADD CONSTRAINT "FitbitActivityLog_sourceConnectedAccountId_fkey" FOREIGN KEY ("sourceConnectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
