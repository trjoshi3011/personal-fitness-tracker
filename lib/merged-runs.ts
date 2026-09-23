import { prisma } from "@/lib/db";
import { isWhoopRunningSportName } from "@/lib/whoop-running-sports";

/** Normalized run for analytics (WHOOP + Fitbit + historical Strava). */
export type NormalizedRun = {
  startAt: Date;
  distanceMeters: number | null;
  movingTimeSec: number | null;
};

export type RunSource = "WHOOP" | "FITBIT" | "STRAVA";

export type RunTableRow = {
  rowKey: string;
  source: RunSource;
  /** Strava providerActivityId, Whoop workout id, or null for Fitbit. */
  providerActivityId: string | null;
  name: string;
  startAt: Date;
  distanceMeters: number | null;
  movingTimeSec: number | null;
  totalElevationM: number | null;
  averageHrBpm: number | null;
  maxHrBpm: number | null;
  /** WHOOP zone_durations payload when present (milli). */
  whoopZoneDurations: unknown | null;
};

type TimedRun = {
  startAt: Date;
  endAt: Date;
  distanceMeters: number | null;
  movingTimeSec: number | null;
  totalElevationM: number | null;
  averageHrBpm: number | null;
  maxHrBpm: number | null;
  source: RunSource;
  rowKey: string;
  providerActivityId: string | null;
  name: string;
  whoopZoneDurations: unknown | null;
};

function likelySameRun(
  a: { startAt: Date; endAt: Date },
  b: { startAt: Date; endAt: Date },
) {
  const startDiffMin =
    Math.abs(a.startAt.getTime() - b.startAt.getTime()) / 60_000;
  if (startDiffMin > 15) return false;
  const durA = Math.max(0, a.endAt.getTime() - a.startAt.getTime());
  const durB = Math.max(0, b.endAt.getTime() - b.startAt.getTime());
  const durDiffMin = Math.abs(durA - durB) / 60_000;
  return durDiffMin <= 25;
}

/** Prefer WHOOP > Fitbit > Strava when the same session appears in multiple sources. */
const SOURCE_RANK: Record<RunSource, number> = {
  WHOOP: 3,
  FITBIT: 2,
  STRAVA: 1,
};

function dedupeRuns(rows: TimedRun[]): TimedRun[] {
  const kept: TimedRun[] = [];
  const sorted = [...rows].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  );
  for (const row of sorted) {
    const overlapIdx = kept.findIndex((k) => likelySameRun(k, row));
    if (overlapIdx < 0) {
      kept.push(row);
      continue;
    }
    const existing = kept[overlapIdx]!;
    if (SOURCE_RANK[row.source] > SOURCE_RANK[existing.source]) {
      kept[overlapIdx] = row;
    }
  }
  return kept;
}

function endAtFromDuration(startAt: Date, movingTimeSec: number | null) {
  const sec =
    typeof movingTimeSec === "number" &&
    Number.isFinite(movingTimeSec) &&
    movingTimeSec > 0
      ? movingTimeSec
      : 0;
  return new Date(startAt.getTime() + sec * 1000);
}

async function loadWhoopRuns(userId: string, start?: Date, end?: Date) {
  const rows = await prisma().whoopWorkout.findMany({
    where: {
      userId,
      ...(start || end
        ? { startAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
        : {}),
    },
    select: {
      id: true,
      providerWorkoutId: true,
      sportName: true,
      startAt: true,
      endAt: true,
      distanceMeters: true,
      altitudeGainMeters: true,
      averageHeartRateBpm: true,
      maxHeartRateBpm: true,
      zoneDurations: true,
    },
    orderBy: { startAt: "desc" },
  });

  return rows
    .filter((r) => isWhoopRunningSportName(r.sportName))
    .map((r) => {
      const movingTimeSec = Math.max(
        0,
        Math.round((r.endAt.getTime() - r.startAt.getTime()) / 1000),
      );
      const distanceMeters =
        typeof r.distanceMeters === "number" && Number.isFinite(r.distanceMeters)
          ? Math.round(r.distanceMeters)
          : null;
      return {
        startAt: r.startAt,
        endAt: r.endAt,
        distanceMeters,
        movingTimeSec: movingTimeSec > 0 ? movingTimeSec : null,
        totalElevationM:
          typeof r.altitudeGainMeters === "number" &&
          Number.isFinite(r.altitudeGainMeters)
            ? r.altitudeGainMeters
            : null,
        averageHrBpm: r.averageHeartRateBpm,
        maxHrBpm: r.maxHeartRateBpm,
        source: "WHOOP" as const,
        rowKey: `w:${r.id}`,
        providerActivityId: r.providerWorkoutId,
        name: "Run (WHOOP)",
        whoopZoneDurations: r.zoneDurations ?? null,
      } satisfies TimedRun;
    });
}

async function loadFitbitRuns(userId: string, start?: Date, end?: Date) {
  const rows = await prisma().fitbitActivityLog.findMany({
    where: {
      userId,
      ...(start || end
        ? { startAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
        : {}),
    },
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
    orderBy: { startAt: "desc" },
  });

  return rows.map((r) => {
    const movingTimeSec =
      r.durationMs != null ? Math.round(r.durationMs / 1000) : null;
    return {
      startAt: r.startAt,
      endAt: endAtFromDuration(r.startAt, movingTimeSec),
      distanceMeters: r.distanceMeters,
      movingTimeSec,
      totalElevationM: r.elevationGainM,
      averageHrBpm: r.averageHeartRateBpm,
      maxHrBpm: r.maxHeartRateBpm,
      source: "FITBIT" as const,
      rowKey: `f:${r.logId}`,
      providerActivityId: null,
      name: r.activityName ?? "Run (Fitbit)",
      whoopZoneDurations: null,
    } satisfies TimedRun;
  });
}

async function loadStravaRuns(userId: string, start?: Date, end?: Date) {
  const rows = await prisma().stravaActivity.findMany({
    where: {
      userId,
      OR: [{ type: "Run" }, { sportType: "Run" }],
      ...(start || end
        ? { startAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
        : {}),
    },
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
    orderBy: { startAt: "desc" },
  });

  return rows.map((r) => ({
    startAt: r.startAt,
    endAt: endAtFromDuration(r.startAt, r.movingTimeSec),
    distanceMeters: r.distanceMeters,
    movingTimeSec: r.movingTimeSec,
    totalElevationM: r.totalElevationM,
    averageHrBpm: r.averageHrBpm,
    maxHrBpm: r.maxHrBpm,
    source: "STRAVA" as const,
    rowKey: `s:${r.providerActivityId}`,
    providerActivityId: r.providerActivityId,
    name: r.name ?? "Run",
    whoopZoneDurations: null,
  })) satisfies TimedRun[];
}

async function loadMergedTimedRuns(
  userId: string,
  start?: Date,
  end?: Date,
): Promise<TimedRun[]> {
  const [whoop, fitbit, strava] = await Promise.all([
    loadWhoopRuns(userId, start, end),
    loadFitbitRuns(userId, start, end),
    loadStravaRuns(userId, start, end),
  ]);
  return dedupeRuns([...whoop, ...fitbit, ...strava]);
}

export async function fetchNormalizedRunsInRange(
  userId: string,
  start: Date,
  end: Date = new Date(),
): Promise<NormalizedRun[]> {
  const merged = await loadMergedTimedRuns(userId, start, end);
  const out: NormalizedRun[] = merged.map((r) => ({
    startAt: r.startAt,
    distanceMeters: r.distanceMeters,
    movingTimeSec: r.movingTimeSec,
  }));
  out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return out;
}

/**
 * Primary dashboard run feed. Historically Strava-only; now WHOOP-first with
 * Fitbit + historical Strava retained (deduped).
 */
export async function fetchStravaRunsInRange(
  userId: string,
  start: Date,
  end: Date = new Date(),
): Promise<NormalizedRun[]> {
  return fetchNormalizedRunsInRange(userId, start, end);
}

export async function fetchRecentRunTableRows(
  userId: string,
  take: number,
): Promise<RunTableRow[]> {
  // Over-fetch so dedupe still fills `take` rows.
  const padEnd = new Date();
  const padStart = new Date(padEnd.getTime() - 400 * 24 * 60 * 60 * 1000);
  const merged = await loadMergedTimedRuns(userId, padStart, padEnd);
  merged.sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  return merged.slice(0, take).map((r) => ({
    rowKey: r.rowKey,
    source: r.source,
    providerActivityId: r.providerActivityId,
    name: r.name,
    startAt: r.startAt,
    distanceMeters: r.distanceMeters,
    movingTimeSec: r.movingTimeSec,
    totalElevationM: r.totalElevationM,
    averageHrBpm: r.averageHrBpm,
    maxHrBpm: r.maxHrBpm,
    whoopZoneDurations: r.whoopZoneDurations,
  }));
}

/** All-time deduped runs (WHOOP-first) for monthly journey rollups. */
export async function fetchAllMergedRunTableRows(
  userId: string,
): Promise<RunTableRow[]> {
  const merged = await loadMergedTimedRuns(userId);
  merged.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return merged.map((r) => ({
    rowKey: r.rowKey,
    source: r.source,
    providerActivityId: r.providerActivityId,
    name: r.name,
    startAt: r.startAt,
    distanceMeters: r.distanceMeters,
    movingTimeSec: r.movingTimeSec,
    totalElevationM: r.totalElevationM,
    averageHrBpm: r.averageHrBpm,
    maxHrBpm: r.maxHrBpm,
    whoopZoneDurations: r.whoopZoneDurations,
  }));
}

/**
 * Returns the user's reference max HR for run intensity normalization.
 */
export async function fetchUserReferenceMaxHr(
  userId: string,
): Promise<number | null> {
  const [strava, fitbit, whoop] = await Promise.all([
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
    prisma().whoopWorkout.findMany({
      where: { userId },
      select: { sportName: true, maxHeartRateBpm: true },
    }),
  ]);

  const whoopMax = whoop
    .filter((w) => isWhoopRunningSportName(w.sportName))
    .map((w) => w.maxHeartRateBpm)
    .filter((v): v is number => typeof v === "number" && v > 100);

  const candidates = [
    strava._max.maxHrBpm,
    fitbit._max.maxHeartRateBpm,
    ...whoopMax,
  ].filter((v): v is number => typeof v === "number" && v > 100);
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

/**
 * Fetch recent run distances (miles) to build an adaptive training profile.
 */
export async function fetchRecentRunDistancesMiForProfile(
  userId: string,
  take: number = 90,
): Promise<number[]> {
  const padEnd = new Date();
  const padStart = new Date(padEnd.getTime() - 400 * 24 * 60 * 60 * 1000);
  const merged = await loadMergedTimedRuns(userId, padStart, padEnd);
  merged.sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  const meters = merged
    .slice(0, take)
    .map((r) => r.distanceMeters ?? 0)
    .filter((m) => typeof m === "number" && Number.isFinite(m) && m > 0);
  return meters.map((m) => m / 1609.344);
}

/** Run start times for calendar markers (all sources, deduped). */
export async function fetchStravaRunStartsInRange(
  userId: string,
  start: Date,
  end: Date,
): Promise<Date[]> {
  const merged = await loadMergedTimedRuns(userId, start, end);
  merged.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return merged.map((r) => r.startAt);
}

/** Sum of run distance meters since `startAt` across WHOOP + Fitbit + Strava (deduped). */
export async function sumRunDistanceMetersSince(
  userId: string,
  startAt: Date,
  endAt: Date = new Date(),
): Promise<number> {
  const merged = await loadMergedTimedRuns(userId, startAt, endAt);
  return merged.reduce((acc, r) => acc + (r.distanceMeters ?? 0), 0);
}
