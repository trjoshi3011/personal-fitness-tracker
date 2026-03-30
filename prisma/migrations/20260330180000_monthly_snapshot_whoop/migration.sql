-- AlterTable
ALTER TABLE "MonthlyFitnessSnapshot" ADD COLUMN     "avgWhoopRecovery" DOUBLE PRECISION,
ADD COLUMN     "avgWhoopStrain" DOUBLE PRECISION,
ADD COLUMN     "avgWhoopHrvMs" DOUBLE PRECISION,
ADD COLUMN     "whoopDaysCount" INTEGER;
