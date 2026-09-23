import { prisma } from "@/lib/db";
import { fetchAllMergedRunTableRows } from "@/lib/merged-runs";

type RunMonthRow = {
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
  avgWhoopWeightKg: number | null;
  whoopDaysCount: number;
};

function aggregateRunsByMonth(
  runs: Awaited<ReturnType<typeof fetchAllMergedRunTableRows>>,
): RunMonthRow[] {
  const map = new Map<
    string,
    {
      year: number;
      month: number;
      runCount: number;
      runDistanceMeters: number;
      runMovingTimeSec: number;
      runElevGainM: number;
    }
  >();

  for (const r of runs) {
    const year = r.startAt.getUTCFullYear();
    const month = r.startAt.getUTCMonth() + 1;
    const key = `${year}-${month}`;
    const cur = map.get(key) ?? {
      year,
      month,
      runCount: 0,
      runDistanceMeters: 0,
      runMovingTimeSec: 0,
      runElevGainM: 0,
    };
    cur.runCount += 1;
    cur.runDistanceMeters += r.distanceMeters ?? 0;
    cur.runMovingTimeSec += r.movingTimeSec ?? 0;
    cur.runElevGainM += r.totalElevationM ?? 0;
    map.set(key, cur);
  }

  return [...map.values()].map((r) => ({
    year: r.year,
    month: r.month,
    runCount: r.runCount,
    runDistanceMeters: Math.round(r.runDistanceMeters),
    runMovingTimeSec: Math.round(r.runMovingTimeSec),
    runElevGainM: r.runElevGainM > 0 ? r.runElevGainM : null,
    avgPaceSecPerMi:
      r.runDistanceMeters > 0
        ? (r.runMovingTimeSec / r.runDistanceMeters) * 1609.344
        : null,
  }));
}

/**
 * Rebuilds monthly rollups from deduped WHOOP + Fitbit + Strava runs (full replace per user).
 * Call after sync so long-term / journey views stay fast and accurate.
 */
export async function recomputeMonthlyFitnessSnapshots(userId: string) {
  const runRows = aggregateRunsByMonth(await fetchAllMergedRunTableRows(userId));

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
      AVG("weightKg") FILTER (WHERE "weightKg" IS NOT NULL)::float AS "avgWhoopWeightKg",
      COUNT(*)::int AS "whoopDaysCount"
    FROM "DailyWhoopStat"
    WHERE "userId" = ${userId}
    GROUP BY 1, 2
  `;

  const runMap = new Map(
    runRows.map((r) => [`${r.year}-${r.month}`, r] as const),
  );
  const fitbitMap = new Map(
    fitbitRows.map((r) => [`${r.year}-${r.month}`, r] as const),
  );
  const whoopMap = new Map(
    whoopRows.map((r) => [`${r.year}-${r.month}`, r] as const),
  );
  const keys = new Set([
    ...runMap.keys(),
    ...fitbitMap.keys(),
    ...whoopMap.keys(),
  ]);

  const records = [...keys].map((key) => {
    const [y, m] = key.split("-").map(Number);
    const s = runMap.get(key);
    const f = fitbitMap.get(key);
    const w = whoopMap.get(key);
    return {
      userId,
      year: y!,
      month: m!,
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
      avgWhoopWeightKg: w?.avgWhoopWeightKg ?? null,
    };
  });

  await prisma().$transaction(async (tx) => {
    await tx.monthlyFitnessSnapshot.deleteMany({ where: { userId } });
    if (records.length > 0) {
      await tx.monthlyFitnessSnapshot.createMany({ data: records });
    }
  });
}
