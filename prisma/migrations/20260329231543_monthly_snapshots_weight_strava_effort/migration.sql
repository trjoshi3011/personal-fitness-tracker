-- AlterTable
ALTER TABLE "DailyFitbitStat" ADD COLUMN     "weightKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "StravaActivity" ADD COLUMN     "calories" INTEGER,
ADD COLUMN     "kilojoules" DOUBLE PRECISION,
ADD COLUMN     "sufferScore" INTEGER,
ADD COLUMN     "weightedAverageWatts" INTEGER;

-- CreateTable
CREATE TABLE "MonthlyFitnessSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "runCount" INTEGER,
    "runDistanceMeters" INTEGER,
    "runMovingTimeSec" INTEGER,
    "runElevGainM" DOUBLE PRECISION,
    "avgPaceSecPerMi" DOUBLE PRECISION,
    "avgSufferScore" DOUBLE PRECISION,
    "totalKilojoules" DOUBLE PRECISION,
    "avgSteps" DOUBLE PRECISION,
    "avgSleepMinutes" DOUBLE PRECISION,
    "avgRestingHr" DOUBLE PRECISION,
    "avgWeightKg" DOUBLE PRECISION,
    "fitbitDaysCount" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyFitnessSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyFitnessSnapshot_userId_year_month_idx" ON "MonthlyFitnessSnapshot"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyFitnessSnapshot_userId_year_month_key" ON "MonthlyFitnessSnapshot"("userId", "year", "month");

-- AddForeignKey
ALTER TABLE "MonthlyFitnessSnapshot" ADD CONSTRAINT "MonthlyFitnessSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
