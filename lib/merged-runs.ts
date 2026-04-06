import { prisma } from "@/lib/db";

/** Normalized run for analytics (Strava runs + Fitbit exercise logs). */
export type NormalizedRun = {
  startAt: Date;
  distanceMeters: number | null;
  movingTimeSec: number | null;
};

export async function fetchNormalizedRunsInRange(
  userId: string,
  start: Date,
  end: Date = new Date(),
): Promise<NormalizedRun[]> {
  const [strava, fitbit] = await Promise.all([
    prisma().stravaActivity.findMany({
      where: {
        userId,
        startAt: { gte: start, lte: end },
        OR: [{ type: "Run" }, { sportType: "Run" }],
      },
      select: {
        startAt: true,
        distanceMeters: true,
        movingTimeSec: true,
      },
    }),
    prisma().fitbitActivityLog.findMany({
      where: { userId, startAt: { gte: start, lte: end } },
      select: { startAt: true, distanceMeters: true, durationMs: true },
    }),
  ]);

  const out: NormalizedRun[] = [
    ...strava.map((r) => ({
      startAt: r.startAt,
      distanceMeters: r.distanceMeters,
      movingTimeSec: r.movingTimeSec,
    })),
    ...fitbit.map((r) => ({
      startAt: r.startAt,
      distanceMeters: r.distanceMeters,
      movingTimeSec:
        r.durationMs != null ? Math.round(r.durationMs / 1000) : null,
    })),
  ];
  out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return out;
}

/** Strava runs only (excludes Fitbit exercise logs). Use for dashboards aligned with Strava + WHOOP. */
export async function fetchStravaRunsInRange(
  userId: string,
  start: Date,
  end: Date = new Date(),
): Promise<NormalizedRun[]> {
  const strava = await prisma().stravaActivity.findMany({
    where: {
      userId,
      startAt: { gte: start, lte: end },
      OR: [{ type: "Run" }, { sportType: "Run" }],
    },
    select: {
      startAt: true,
      distanceMeters: true,
      movingTimeSec: true,
    },
  });
  const out: NormalizedRun[] = strava.map((r) => ({
    startAt: r.startAt,
    distanceMeters: r.distanceMeters,
    movingTimeSec: r.movingTimeSec,
  }));
  out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return out;
}

export type RunTableRow = {
  rowKey: string;
  source: "STRAVA" | "FITBIT";
  name: string;
  startAt: Date;
  distanceMeters: number | null;
  movingTimeSec: number | null;
  totalElevationM: number | null;
  averageHrBpm: number | null;
  maxHrBpm: number | null;
};

export async function fetchRecentRunTableRows(
  userId: string,
  take: number,
): Promise<RunTableRow[]> {
  const [strava, fitbit] = await Promise.all([
    prisma().stravaActivity.findMany({
      where: {
        userId,
        OR: [{ type: "Run" }, { sportType: "Run" }],
      },
      orderBy: { startAt: "desc" },
      take: take * 2,
      select: {
        providerActivityId: true,
        name: true,
        startAt: true,
        distanceMeters: true,
        movingTimeSec: true,
        totalElevationM: true,
        averageHrBpm: true,
        maxHrBpm: true,
      },
    }),
    prisma().fitbitActivityLog.findMany({
      where: { userId },
      orderBy: { startAt: "desc" },
      take: take * 2,
      select: {
        logId: true,
        activityName: true,
        startAt: true,
        distanceMeters: true,
        durationMs: true,
        elevationGainM: true,
        averageHeartRateBpm: true,
        maxHeartRateBpm: true,
      },
    }),
  ]);

  const rows: RunTableRow[] = [
    ...strava.map((r) => ({
      rowKey: `s:${r.providerActivityId}`,
      source: "STRAVA" as const,
      name: r.name ?? "Run",
      startAt: r.startAt,
      distanceMeters: r.distanceMeters,
      movingTimeSec: r.movingTimeSec,
      totalElevationM: r.totalElevationM,
      averageHrBpm: r.averageHrBpm,
      maxHrBpm: r.maxHrBpm,
    })),
    ...fitbit.map((r) => ({
      rowKey: `f:${r.logId}`,
      source: "FITBIT" as const,
      name: r.activityName ?? "Run (Fitbit)",
      startAt: r.startAt,
      distanceMeters: r.distanceMeters,
      movingTimeSec:
        r.durationMs != null ? Math.round(r.durationMs / 1000) : null,
      totalElevationM: r.elevationGainM,
      averageHrBpm: r.averageHeartRateBpm,
      maxHrBpm: r.maxHeartRateBpm,
    })),
  ];

  rows.sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  return rows.slice(0, take);
}

/** Strava runs only — start times for calendar markers. */
export async function fetchStravaRunStartsInRange(
  userId: string,
  start: Date,
  end: Date,
): Promise<Date[]> {
  const rows = await prisma().stravaActivity.findMany({
    where: {
      userId,
      startAt: { gte: start, lt: end },
      OR: [{ type: "Run" }, { sportType: "Run" }],
    },
    select: { startAt: true },
    orderBy: { startAt: "asc" },
  });
  return rows.map((r) => r.startAt);
}
