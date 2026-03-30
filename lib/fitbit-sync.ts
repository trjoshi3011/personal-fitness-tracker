import { prisma } from "@/lib/db";
import { syncFitbitRunActivityLogs } from "@/lib/fitbit-activity-sync";
import { recomputeMonthlyFitnessSnapshots } from "@/lib/monthly-snapshots";
import {
  FITBIT_API_CHUNK_DAYS,
  MAX_FITBIT_RUN_LOG_DAYS,
  MAX_FITBIT_SYNC_DAYS,
  utcInclusiveWindowStart,
} from "@/lib/sync-constants";

function ymdToUtcDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid Fitbit date: ${ymd}`);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function formatFitbitDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseSeriesInt(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

function parseSeriesFloat(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type DayAgg = {
  steps: number | null;
  distanceKm: number | null;
  floors: number | null;
  caloriesOut: number | null;
  restingHeartRateBpm: number | null;
  activeMinutes: number | null;
  sleepMinutes: number | null;
  sleepEfficiency: number | null;
  weightKg: number | null;
};

function emptyDay(): DayAgg {
  return {
    steps: null,
    distanceKm: null,
    floors: null,
    caloriesOut: null,
    restingHeartRateBpm: null,
    activeMinutes: null,
    sleepMinutes: null,
    sleepEfficiency: null,
    weightKg: null,
  };
}

async function fitbitGetJson(path: string, accessToken: string) {
  const res = await fetch(`https://api.fitbit.com${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const msg =
      typeof (json as any)?.errors?.[0]?.message === "string"
        ? (json as any).errors[0].message
        : typeof (json as any)?.errorType === "string"
          ? `${(json as any).errorType}: ${(json as any).errorDescription ?? ""}`
          : `Fitbit API request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

async function fitbitGetOptional(path: string, accessToken: string) {
  try {
    return await fitbitGetJson(path, accessToken);
  } catch {
    return null;
  }
}

function setSeriesInt(
  day: DayAgg,
  field: "steps" | "floors" | "caloriesOut",
  n: number,
) {
  if (field === "steps") day.steps = n;
  else if (field === "floors") day.floors = n;
  else day.caloriesOut = n;
}

function ingestTimeSeriesInt(
  map: Map<string, DayAgg>,
  field: "steps" | "floors" | "caloriesOut",
  payload: unknown,
  seriesKey: string,
) {
  const rows = (payload as Record<string, unknown>)?.[seriesKey];
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const dateTime = typeof r.dateTime === "string" ? r.dateTime : null;
    if (!dateTime) continue;
    const day = map.get(dateTime) ?? emptyDay();
    const n = parseSeriesInt(r.value);
    if (n != null) setSeriesInt(day, field, n);
    map.set(dateTime, day);
  }
}

function ingestDistanceSeries(map: Map<string, DayAgg>, payload: unknown) {
  const rows = (payload as Record<string, unknown>)?.["activities-distance"];
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const dateTime = typeof r.dateTime === "string" ? r.dateTime : null;
    if (!dateTime) continue;
    const day = map.get(dateTime) ?? emptyDay();
    const km = parseSeriesFloat(r.value);
    if (km != null) day.distanceKm = km;
    map.set(dateTime, day);
  }
}

function ingestHeartSeries(map: Map<string, DayAgg>, payload: unknown) {
  const rows = (payload as Record<string, unknown>)?.["activities-heart"];
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const dateTime = typeof r.dateTime === "string" ? r.dateTime : null;
    if (!dateTime) continue;
    const value = r.value as Record<string, unknown> | undefined;
    const rhr = value?.restingHeartRate;
    const n = parseSeriesInt(rhr);
    if (n == null) continue;
    const day = map.get(dateTime) ?? emptyDay();
    day.restingHeartRateBpm = n;
    map.set(dateTime, day);
  }
}

function ingestActiveMinutes(
  map: Map<string, DayAgg>,
  very: unknown,
  fair: unknown,
  light: unknown,
) {
  const merge = (
    payload: unknown,
    seriesKey: string,
    into: Map<string, number>,
  ) => {
    const rows = (payload as Record<string, unknown>)?.[seriesKey];
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const dateTime = typeof r.dateTime === "string" ? r.dateTime : null;
      if (!dateTime) continue;
      const n = parseSeriesInt(r.value) ?? 0;
      into.set(dateTime, (into.get(dateTime) ?? 0) + n);
    }
  };

  const acc = new Map<string, number>();
  merge(very, "activities-minutesVeryActive", acc);
  merge(fair, "activities-minutesFairlyActive", acc);
  merge(light, "activities-minutesLightlyActive", acc);
  for (const [dateTime, total] of acc) {
    const day = map.get(dateTime) ?? emptyDay();
    day.activeMinutes = total;
    map.set(dateTime, day);
  }
}

function ingestSleep(map: Map<string, DayAgg>, payload: unknown) {
  const sleep = (payload as Record<string, unknown>)?.sleep;
  if (!Array.isArray(sleep)) return;

  type Agg = { minutes: number; effWeighted: number };
  const byDate = new Map<string, Agg>();

  for (const log of sleep) {
    const l = log as Record<string, unknown>;
    const dateOfSleep =
      typeof l.dateOfSleep === "string" ? l.dateOfSleep : null;
    if (!dateOfSleep) continue;
    const minutes = parseSeriesInt(l.minutesAsleep) ?? 0;
    const eff = parseSeriesInt(l.efficiency);
    const cur = byDate.get(dateOfSleep) ?? { minutes: 0, effWeighted: 0 };
    cur.minutes += minutes;
    if (eff != null && minutes > 0) cur.effWeighted += eff * minutes;
    byDate.set(dateOfSleep, cur);
  }

  for (const [dateTime, { minutes, effWeighted }] of byDate) {
    const day = map.get(dateTime) ?? emptyDay();
    day.sleepMinutes = minutes > 0 ? minutes : null;
    day.sleepEfficiency =
      minutes > 0 && effWeighted > 0
        ? Math.round(effWeighted / minutes)
        : null;
    map.set(dateTime, day);
  }
}

function ingestBodyWeight(
  map: Map<string, DayAgg>,
  payload: unknown,
  toKg: (w: number) => number,
) {
  const rows = (payload as Record<string, unknown>)?.["body-weight"];
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const dateTime = typeof r.dateTime === "string" ? r.dateTime : null;
    if (!dateTime) continue;
    const w = parseSeriesFloat(r.value);
    if (w == null) continue;
    const day = map.get(dateTime) ?? emptyDay();
    day.weightKg = toKg(w);
    map.set(dateTime, day);
  }
}

type SourceFlags = {
  steps: boolean;
  distance: boolean;
  floors: boolean;
  calories: boolean;
  activeMinutes: boolean;
  heart: boolean;
  sleep: boolean;
  weight: boolean;
};

async function mergeFitbitChunkIntoMap(
  map: Map<string, DayAgg>,
  startStr: string,
  endStr: string,
  accessToken: string,
  toKg: (w: number) => number,
  flags: SourceFlags,
) {
  const [
    steps,
    distance,
    floors,
    calories,
    very,
    fair,
    light,
    heart,
    sleep,
    weight,
  ] = await Promise.all([
    fitbitGetOptional(
      `/1/user/-/activities/steps/date/${startStr}/${endStr}.json`,
      accessToken,
    ),
    fitbitGetOptional(
      `/1/user/-/activities/distance/date/${startStr}/${endStr}.json`,
      accessToken,
    ),
    fitbitGetOptional(
      `/1/user/-/activities/floors/date/${startStr}/${endStr}.json`,
      accessToken,
    ),
    fitbitGetOptional(
      `/1/user/-/activities/calories/date/${startStr}/${endStr}.json`,
      accessToken,
    ),
    fitbitGetOptional(
      `/1/user/-/activities/minutesVeryActive/date/${startStr}/${endStr}.json`,
      accessToken,
    ),
    fitbitGetOptional(
      `/1/user/-/activities/minutesFairlyActive/date/${startStr}/${endStr}.json`,
      accessToken,
    ),
    fitbitGetOptional(
      `/1/user/-/activities/minutesLightlyActive/date/${startStr}/${endStr}.json`,
      accessToken,
    ),
    fitbitGetOptional(
      `/1/user/-/activities/heart/date/${startStr}/${endStr}.json`,
      accessToken,
    ),
    fitbitGetOptional(
      `/1.2/user/-/sleep/date/${startStr}/${endStr}.json`,
      accessToken,
    ),
    fitbitGetOptional(
      `/1/user/-/body/weight/date/${startStr}/${endStr}.json`,
      accessToken,
    ),
  ]);

  if (steps) flags.steps = true;
  if (distance) flags.distance = true;
  if (floors) flags.floors = true;
  if (calories) flags.calories = true;
  if (very && fair && light) flags.activeMinutes = true;
  if (heart) flags.heart = true;
  if (sleep) flags.sleep = true;
  if (weight) flags.weight = true;

  if (steps)
    ingestTimeSeriesInt(map, "steps", steps, "activities-steps");
  if (distance) ingestDistanceSeries(map, distance);
  if (floors)
    ingestTimeSeriesInt(map, "floors", floors, "activities-floors");
  if (calories)
    ingestTimeSeriesInt(map, "caloriesOut", calories, "activities-calories");
  ingestActiveMinutes(map, very, fair, light);
  if (heart) ingestHeartSeries(map, heart);
  if (sleep) ingestSleep(map, sleep);
  if (weight) ingestBodyWeight(map, weight, toKg);
}

export async function syncFitbitDailyStats({
  userId,
  connectedAccountId,
  accessToken,
  days,
}: {
  userId: string;
  connectedAccountId: string;
  accessToken: string;
  days: number;
}) {
  const daysClamped =
    Number.isFinite(days) && days > 0
      ? Math.min(days, MAX_FITBIT_SYNC_DAYS)
      : 90;

  const end = new Date();
  const start = utcInclusiveWindowStart(end, daysClamped);

  const profile = (await fitbitGetOptional(
    "/1/user/-/profile.json",
    accessToken,
  )) as { user?: { weightUnit?: string } } | null;
  const wu = String(profile?.user?.weightUnit ?? "").toUpperCase();
  const metricWeight = wu === "METRIC";
  const toKg = (w: number) => (metricWeight ? w : w * 0.45359237);

  const map = new Map<string, DayAgg>();
  const flags: SourceFlags = {
    steps: false,
    distance: false,
    floors: false,
    calories: false,
    activeMinutes: false,
    heart: false,
    sleep: false,
    weight: false,
  };

  const ONE = 86400000;
  let rangeEnd = end;
  let chunkIndex = 0;
  while (rangeEnd >= start) {
    const chunkMs = (FITBIT_API_CHUNK_DAYS - 1) * ONE;
    const rangeStart = new Date(
      Math.max(start.getTime(), rangeEnd.getTime() - chunkMs),
    );
    const startStr = formatFitbitDate(rangeStart);
    const endStr = formatFitbitDate(rangeEnd);

    if (chunkIndex > 0) {
      await new Promise((r) => setTimeout(r, 1500));
    }

    try {
      await mergeFitbitChunkIntoMap(
        map,
        startStr,
        endStr,
        accessToken,
        toKg,
        flags,
      );
    } catch {
      // Skip failed chunk; other chunks still merge.
    }

    rangeEnd = new Date(rangeStart.getTime() - ONE);
    chunkIndex++;
  }

  const rawMeta = { sources: flags };

  let upserted = 0;
  for (const [ymd, agg] of map) {
    const date = ymdToUtcDate(ymd);
    await prisma().dailyFitbitStat.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        steps: agg.steps,
        distanceKm: agg.distanceKm,
        floors: agg.floors,
        caloriesOut: agg.caloriesOut,
        restingHeartRateBpm: agg.restingHeartRateBpm,
        activeMinutes: agg.activeMinutes,
        sleepMinutes: agg.sleepMinutes,
        sleepEfficiency: agg.sleepEfficiency,
        weightKg: agg.weightKg,
        rawPayload: rawMeta as object,
        sourceConnectedAccountId: connectedAccountId,
      },
      update: {
        steps: agg.steps,
        distanceKm: agg.distanceKm,
        floors: agg.floors,
        caloriesOut: agg.caloriesOut,
        restingHeartRateBpm: agg.restingHeartRateBpm,
        activeMinutes: agg.activeMinutes,
        sleepMinutes: agg.sleepMinutes,
        sleepEfficiency: agg.sleepEfficiency,
        ...(agg.weightKg != null ? { weightKg: agg.weightKg } : {}),
        rawPayload: rawMeta as object,
        sourceConnectedAccountId: connectedAccountId,
      },
      select: { id: true },
    });
    upserted += 1;
  }

  await prisma().connectedAccount.update({
    where: { id: connectedAccountId },
    data: { lastSyncedAt: new Date() },
  });

  try {
    // Exercise logs always use the max window so short daily syncs (e.g. 90d on login)
    // still backfill tracker runs from earlier months (daily stats stay `daysClamped`).
    await syncFitbitRunActivityLogs({
      userId,
      connectedAccountId,
      accessToken,
      days: MAX_FITBIT_RUN_LOG_DAYS,
    });
  } catch {
    // Activity list API is best-effort; daily stats are already saved.
  }

  try {
    await recomputeMonthlyFitnessSnapshots(userId);
  } catch {
    // Best-effort rollups
  }

  return {
    fetched: map.size,
    upserted,
    days: daysClamped,
  };
}

export type FitbitSyncWithLogResult =
  | { ok: true; fetched: number; upserted: number; days: number }
  | { ok: false; error: string };

export async function syncFitbitDailyStatsWithLog({
  userId,
  connectedAccountId,
  days,
  getAccessToken,
}: {
  userId: string;
  connectedAccountId: string;
  days: number;
  getAccessToken: () => Promise<string | null>;
}): Promise<FitbitSyncWithLogResult> {
  const daysClamped =
    Number.isFinite(days) && days > 0
      ? Math.min(days, MAX_FITBIT_SYNC_DAYS)
      : 90;
  const startedAt = new Date();
  const windowEndAt = new Date();
  // Log the broadest window we touch: exercise logs go back MAX_FITBIT_RUN_LOG_DAYS.
  const windowStartAt = utcInclusiveWindowStart(
    windowEndAt,
    MAX_FITBIT_RUN_LOG_DAYS,
  );

  const syncLog = await prisma().syncLog.create({
    data: {
      userId,
      provider: "FITBIT",
      status: "PARTIAL",
      startedAt,
      windowStartAt,
      windowEndAt,
      connectedAccountId,
      fetchedCount: 0,
      upsertedCount: 0,
    },
    select: { id: true },
  });

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      const msg = "Fitbit not connected";
      await prisma().syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: msg,
        },
      });
      return { ok: false, error: msg };
    }

    const result = await syncFitbitDailyStats({
      userId,
      connectedAccountId,
      accessToken,
      days: daysClamped,
    });

    await prisma().syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        fetchedCount: result.fetched,
        upsertedCount: result.upserted,
      },
    });

    return {
      ok: true,
      fetched: result.fetched,
      upserted: result.upserted,
      days: result.days,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma().syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: message,
      },
    });
    return { ok: false, error: message };
  }
}
