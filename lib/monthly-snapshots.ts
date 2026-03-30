import { prisma } from "@/lib/db";

type StravaMonthRow = {
  year: number;
  month: number;
  runCount: number;
  runDistanceMeters: number;
  runMovingTimeSec: number;
  runElevGainM: number | null;
  avgPaceSecPerMi: number | null;
};

type FitbitMonthRow = {
  year: number;
  month: number;
  avgSteps: number | null;
  avgSleepMinutes: number | null;
  avgRestingHr: number | null;
  avgWeightKg: number | null;
  fitbitDaysCount: number;
};

type WhoopMonthRow = {
  year: number;
  month: number;
  avgWhoopRecovery: number | null;
  avgWhoopStrain: number | null;
  avgWhoopHrvMs: number | null;
  whoopDaysCount: number;
};

/**
 * Rebuilds monthly rollups from raw Strava + Fitbit rows (full replace per user).
 * Call after sync so long-term / journey views stay fast and accurate.
 */
export async function recomputeMonthlyFitnessSnapshots(userId: string) {
  const stravaRows = await prisma().$queryRaw<StravaMonthRow[]>`
    WITH combined AS (
      SELECT
        "startAt",
        "distanceMeters",
        "movingTimeSec",
        "totalElevationM" AS elev
      FROM "StravaActivity"
      WHERE "userId" = ${userId}
        AND ("type" = 'Run' OR "sportType" = 'Run')
      UNION ALL
      SELECT
        "startAt",
        "distanceMeters",
        CASE
          WHEN "durationMs" IS NOT NULL
          THEN ROUND("durationMs" / 1000.0)::int
          ELSE NULL
        END AS "movingTimeSec",
        "elevationGainM" AS elev
      FROM "FitbitActivityLog"
      WHERE "userId" = ${userId}
    )
    SELECT
      EXTRACT(YEAR FROM "startAt")::int AS year,
      EXTRACT(MONTH FROM "startAt")::int AS month,
      COUNT(*)::int AS "runCount",
      COALESCE(SUM("distanceMeters"), 0)::int AS "runDistanceMeters",
      COALESCE(SUM("movingTimeSec"), 0)::int AS "runMovingTimeSec",
      SUM(elev)::float AS "runElevGainM",
      CASE
        WHEN COALESCE(SUM("distanceMeters"), 0) > 0
        THEN (SUM("movingTimeSec")::float / SUM("distanceMeters")::float) * 1609.344
        ELSE NULL
      END AS "avgPaceSecPerMi"
    FROM combined
    GROUP BY 1, 2
  `;

  const fitbitRows = await prisma().$queryRaw<FitbitMonthRow[]>`
    SELECT
      EXTRACT(YEAR FROM date)::int AS year,
      EXTRACT(MONTH FROM date)::int AS month,
      AVG(steps)::float AS "avgSteps",
      AVG("sleepMinutes")::float AS "avgSleepMinutes",
      AVG("restingHeartRateBpm")::float AS "avgRestingHr",
      AVG("weightKg")::float AS "avgWeightKg",
      COUNT(*)::int AS "fitbitDaysCount"
    FROM "DailyFitbitStat"
    WHERE "userId" = ${userId}
    GROUP BY 1, 2
  `;

  const whoopRows = await prisma().$queryRaw<WhoopMonthRow[]>`
    SELECT
      EXTRACT(YEAR FROM date)::int AS year,
      EXTRACT(MONTH FROM date)::int AS month,
      AVG("recoveryScore")::float AS "avgWhoopRecovery",
      AVG(strain)::float AS "avgWhoopStrain",
      AVG("hrvRmssdMs")::float AS "avgWhoopHrvMs",
      COUNT(*)::int AS "whoopDaysCount"
    FROM "DailyWhoopStat"
    WHERE "userId" = ${userId}
    GROUP BY 1, 2
  `;

  const stravaMap = new Map(
    stravaRows.map((r) => [`${r.year}-${r.month}`, r] as const),
  );
  const fitbitMap = new Map(
    fitbitRows.map((r) => [`${r.year}-${r.month}`, r] as const),
  );
  const whoopMap = new Map(
    whoopRows.map((r) => [`${r.year}-${r.month}`, r] as const),
  );
  const keys = new Set([
    ...stravaMap.keys(),
    ...fitbitMap.keys(),
    ...whoopMap.keys(),
  ]);

  const records = [...keys].map((key) => {
    const [y, m] = key.split("-").map(Number);
    const s = stravaMap.get(key);
    const f = fitbitMap.get(key);
    const w = whoopMap.get(key);
    return {
      userId,
      year: y,
      month: m,
      runCount: s?.runCount ?? null,
      runDistanceMeters: s?.runDistanceMeters ?? null,
      runMovingTimeSec: s?.runMovingTimeSec ?? null,
      runElevGainM: s?.runElevGainM ?? null,
      avgPaceSecPerMi: s?.avgPaceSecPerMi ?? null,
      avgSteps: f?.avgSteps ?? null,
      avgSleepMinutes: f?.avgSleepMinutes ?? null,
      avgRestingHr: f?.avgRestingHr ?? null,
      avgWeightKg: f?.avgWeightKg ?? null,
      fitbitDaysCount: f?.fitbitDaysCount ?? null,
      avgWhoopRecovery: w?.avgWhoopRecovery ?? null,
      avgWhoopStrain: w?.avgWhoopStrain ?? null,
      avgWhoopHrvMs: w?.avgWhoopHrvMs ?? null,
      whoopDaysCount: w?.whoopDaysCount ?? null,
    };
  });

  await prisma().$transaction(async (tx) => {
    await tx.monthlyFitnessSnapshot.deleteMany({ where: { userId } });
    if (records.length > 0) {
      await tx.monthlyFitnessSnapshot.createMany({ data: records });
    }
  });
}
