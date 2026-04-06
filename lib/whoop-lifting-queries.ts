import { prisma } from "@/lib/db";
import { WHOOP_LIFTING_SPORT_NAMES } from "@/lib/whoop-lifting-sports";

export type WhoopLiftingRow = {
  id: string;
  startAt: Date;
  endAt: Date;
  sportName: string;
  scoreState: string;
  strain: number | null;
  averageHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  kilojoule: number | null;
  percentRecorded: number | null;
  zoneDurations: unknown;
};

export async function fetchWhoopLiftingWorkoutsInRange(
  userId: string,
  start: Date,
  end: Date,
): Promise<WhoopLiftingRow[]> {
  return prisma().whoopWorkout.findMany({
    where: {
      userId,
      startAt: { gte: start, lt: end },
      sportName: { in: [...WHOOP_LIFTING_SPORT_NAMES] },
    },
    orderBy: { startAt: "desc" },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      sportName: true,
      scoreState: true,
      strain: true,
      averageHeartRateBpm: true,
      maxHeartRateBpm: true,
      kilojoule: true,
      percentRecorded: true,
      zoneDurations: true,
    },
  });
}
