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
  /** Strava providerActivityId (string) for STRAVA rows; null for Fitbit rows. */
  providerActivityId: string | null;
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
      providerActivityId: r.providerActivityId,
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
      providerActivityId: null,
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

/**
 * Returns the user's reference max HR for run intensity normalization.
 * Uses the highest observed `maxHrBpm` across all of their runs (Strava +
 * Fitbit). Returns null when no run has a usable HR sample.
 *
 * This is used by the run classifier so that intensity (Z1–Z5) is judged
 * against the user's actual ceiling, not whatever happened in a single run.
 */
export async function fetchUserReferenceMaxHr(
  userId: string,
): Promise<number | null> {
  const [strava, fitbit] = await Promise.all([
    prisma().stravaActivity.aggregate({
      where: {
        userId,
        OR: [{ type: "Run" }, { sportType: "Run" }],
      },
      _max: { maxHrBpm: true },
    }),
    prisma().fitbitActivityLog.aggregate({
      where: { userId },
      _max: { maxHeartRateBpm: true },
    }),
  ]);

  const candidates = [strava._max.maxHrBpm, fitbit._max.maxHeartRateBpm].filter(
    (v): v is number => typeof v === "number" && v > 100,
  );
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
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
