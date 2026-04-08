-- CreateEnum
CREATE TYPE "LiftSessionTemplate" AS ENUM ('FULL_BODY', 'PUSH', 'PULL', 'LEGS');

-- CreateTable
CREATE TABLE "LiftSessionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionAt" TIMESTAMP(3) NOT NULL,
    "template" "LiftSessionTemplate" NOT NULL,
    "exercises" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "whoopWorkoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiftSessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiftSplitWeeklyTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullBodyTarget" INTEGER NOT NULL DEFAULT 0,
    "pushTarget" INTEGER NOT NULL DEFAULT 0,
    "pullTarget" INTEGER NOT NULL DEFAULT 0,
    "legsTarget" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiftSplitWeeklyTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiftSessionLog_userId_sessionAt_idx" ON "LiftSessionLog"("userId", "sessionAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiftSplitWeeklyTarget_userId_key" ON "LiftSplitWeeklyTarget"("userId");

-- AddForeignKey
ALTER TABLE "LiftSessionLog" ADD CONSTRAINT "LiftSessionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftSessionLog" ADD CONSTRAINT "LiftSessionLog_whoopWorkoutId_fkey" FOREIGN KEY ("whoopWorkoutId") REFERENCES "WhoopWorkout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftSplitWeeklyTarget" ADD CONSTRAINT "LiftSplitWeeklyTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
