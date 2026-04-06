-- CreateTable
CREATE TABLE "WhoopWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerWorkoutId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezoneOffset" TEXT,
    "sportName" TEXT NOT NULL,
    "sportId" INTEGER,
    "scoreState" TEXT NOT NULL,
    "strain" DOUBLE PRECISION,
    "averageHeartRateBpm" INTEGER,
    "maxHeartRateBpm" INTEGER,
    "kilojoule" DOUBLE PRECISION,
    "percentRecorded" DOUBLE PRECISION,
    "distanceMeters" DOUBLE PRECISION,
    "altitudeGainMeters" DOUBLE PRECISION,
    "altitudeChangeMeters" DOUBLE PRECISION,
    "zoneDurations" JSONB,
    "rawPayload" JSONB,
    "sourceConnectedAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhoopWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhoopWorkout_userId_startAt_idx" ON "WhoopWorkout"("userId", "startAt");

-- CreateIndex
CREATE INDEX "WhoopWorkout_userId_sportName_idx" ON "WhoopWorkout"("userId", "sportName");

-- CreateIndex
CREATE INDEX "WhoopWorkout_startAt_idx" ON "WhoopWorkout"("startAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhoopWorkout_userId_providerWorkoutId_key" ON "WhoopWorkout"("userId", "providerWorkoutId");

-- AddForeignKey
ALTER TABLE "WhoopWorkout" ADD CONSTRAINT "WhoopWorkout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhoopWorkout" ADD CONSTRAINT "WhoopWorkout_sourceConnectedAccountId_fkey" FOREIGN KEY ("sourceConnectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
