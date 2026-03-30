-- AlterEnum
ALTER TYPE "Provider" ADD VALUE 'WHOOP';

-- CreateTable
CREATE TABLE "DailyWhoopStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "recoveryScore" INTEGER,
    "strain" DOUBLE PRECISION,
    "restingHeartRateBpm" INTEGER,
    "hrvRmssdMs" DOUBLE PRECISION,
    "spo2Percentage" DOUBLE PRECISION,
    "skinTempCelsius" DOUBLE PRECISION,
    "sleepMinutes" INTEGER,
    "sleepPerformancePct" DOUBLE PRECISION,
    "sleepEfficiencyPct" DOUBLE PRECISION,
    "sleepConsistencyPct" DOUBLE PRECISION,
    "rawPayload" JSONB,
    "sourceConnectedAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWhoopStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyWhoopStat_userId_date_idx" ON "DailyWhoopStat"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyWhoopStat_date_idx" ON "DailyWhoopStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWhoopStat_userId_date_key" ON "DailyWhoopStat"("userId", "date");

-- AddForeignKey
ALTER TABLE "DailyWhoopStat" ADD CONSTRAINT "DailyWhoopStat_sourceConnectedAccountId_fkey" FOREIGN KEY ("sourceConnectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWhoopStat" ADD CONSTRAINT "DailyWhoopStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
