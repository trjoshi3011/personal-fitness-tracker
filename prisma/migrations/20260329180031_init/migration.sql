-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('FITBIT', 'STRAVA');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenType" TEXT,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rawAuthPayload" JSONB,
    "rawProfilePayload" JSONB,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyFitbitStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "steps" INTEGER,
    "caloriesOut" INTEGER,
    "distanceKm" DOUBLE PRECISION,
    "floors" INTEGER,
    "restingHeartRateBpm" INTEGER,
    "activeMinutes" INTEGER,
    "sleepMinutes" INTEGER,
    "sleepEfficiency" INTEGER,
    "rawPayload" JSONB,
    "sourceConnectedAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyFitbitStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StravaActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerActivityId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "startDateLocal" TIMESTAMP(3),
    "timezone" TEXT,
    "type" TEXT,
    "name" TEXT,
    "sportType" TEXT,
    "distanceMeters" INTEGER,
    "movingTimeSec" INTEGER,
    "elapsedTimeSec" INTEGER,
    "totalElevationM" DOUBLE PRECISION,
    "averageSpeedMps" DOUBLE PRECISION,
    "averageHrBpm" INTEGER,
    "maxHrBpm" INTEGER,
    "rawPayload" JSONB,
    "sourceConnectedAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StravaActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DerivedDailyMetric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "algorithmVersion" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceFitbitStatId" TEXT,
    "sourceStravaActivityId" TEXT,
    "rawComputation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DerivedDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'SUCCESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "cursor" TEXT,
    "windowStartAt" TIMESTAMP(3),
    "windowEndAt" TIMESTAMP(3),
    "fetchedCount" INTEGER DEFAULT 0,
    "upsertedCount" INTEGER DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "rawPayload" JSONB,
    "connectedAccountId" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "ConnectedAccount_userId_provider_idx" ON "ConnectedAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX "ConnectedAccount_provider_updatedAt_idx" ON "ConnectedAccount"("provider", "updatedAt");

-- CreateIndex
CREATE INDEX "ConnectedAccount_userId_lastSyncedAt_idx" ON "ConnectedAccount"("userId", "lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_provider_providerAccountId_key" ON "ConnectedAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_userId_provider_key" ON "ConnectedAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX "DailyFitbitStat_userId_date_idx" ON "DailyFitbitStat"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyFitbitStat_date_idx" ON "DailyFitbitStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyFitbitStat_userId_date_key" ON "DailyFitbitStat"("userId", "date");

-- CreateIndex
CREATE INDEX "StravaActivity_userId_startAt_idx" ON "StravaActivity"("userId", "startAt");

-- CreateIndex
CREATE INDEX "StravaActivity_startAt_idx" ON "StravaActivity"("startAt");

-- CreateIndex
CREATE INDEX "StravaActivity_userId_providerActivityId_idx" ON "StravaActivity"("userId", "providerActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "StravaActivity_providerActivityId_key" ON "StravaActivity"("providerActivityId");

-- CreateIndex
CREATE INDEX "DerivedDailyMetric_userId_date_idx" ON "DerivedDailyMetric"("userId", "date");

-- CreateIndex
CREATE INDEX "DerivedDailyMetric_key_date_idx" ON "DerivedDailyMetric"("key", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DerivedDailyMetric_userId_date_key_key" ON "DerivedDailyMetric"("userId", "date", "key");

-- CreateIndex
CREATE INDEX "SyncLog_userId_provider_startedAt_idx" ON "SyncLog"("userId", "provider", "startedAt");

-- CreateIndex
CREATE INDEX "SyncLog_provider_startedAt_idx" ON "SyncLog"("provider", "startedAt");

-- CreateIndex
CREATE INDEX "SyncLog_status_startedAt_idx" ON "SyncLog"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyFitbitStat" ADD CONSTRAINT "DailyFitbitStat_sourceConnectedAccountId_fkey" FOREIGN KEY ("sourceConnectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyFitbitStat" ADD CONSTRAINT "DailyFitbitStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StravaActivity" ADD CONSTRAINT "StravaActivity_sourceConnectedAccountId_fkey" FOREIGN KEY ("sourceConnectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StravaActivity" ADD CONSTRAINT "StravaActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerivedDailyMetric" ADD CONSTRAINT "DerivedDailyMetric_sourceFitbitStatId_fkey" FOREIGN KEY ("sourceFitbitStatId") REFERENCES "DailyFitbitStat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerivedDailyMetric" ADD CONSTRAINT "DerivedDailyMetric_sourceStravaActivityId_fkey" FOREIGN KEY ("sourceStravaActivityId") REFERENCES "StravaActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerivedDailyMetric" ADD CONSTRAINT "DerivedDailyMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
