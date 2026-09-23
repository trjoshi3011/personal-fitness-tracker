import { prisma } from "@/lib/db";
import { recomputeMonthlyFitnessSnapshots } from "@/lib/monthly-snapshots";
import {
  MAX_WHOOP_SYNC_DAYS,
  WHOOP_API_CHUNK_DAYS,
  utcInclusiveWindowStart,
} from "@/lib/sync-constants";

const WHOOP_API = "https://api.prod.whoop.com/developer";

function isoToUserLocalUtcDate(iso: string, timeZone: string): Date {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (!y || !m || !day) {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }
  return new Date(Date.UTC(y, m - 1, day));
}

export async function whoopDeveloperApiGet(path: string, accessToken: string) {
  const maxAttempts = 4;
  let lastStatus = 0;
  let lastJson: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${WHOOP_API}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    lastStatus = res.status;
    lastJson = await res.json().catch(() => null);

    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfterSec = Number(res.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? Math.min(retryAfterSec * 1000, 30_000)
          : Math.min(1000 * 2 ** (attempt - 1), 15_000);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!res.ok) {
      const msg =
        typeof (lastJson as { message?: string })?.message === "string"
          ? (lastJson as { message: string }).message
          : `WHOOP API request failed (${lastStatus})`;
      throw new Error(msg);
    }

    return lastJson;
  }

  throw new Error(`WHOOP API request failed (${lastStatus || 429})`);
}

type RecoveryRow = {
  cycle_id: number;
  sleep_id: string;
  score_state: string;
  score?: {
    user_calibrating?: boolean;
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
};

type SleepRow = {
  nap?: boolean;
  end?: string;
  score_state?: string;
  score?: {
    stage_summary?: { total_in_bed_time_milli?: number };
    sleep_performance_percentage?: number;
    sleep_efficiency_percentage?: number;
    sleep_consistency_percentage?: number;
  };
};

type CycleRow = {
  score_state?: string;
  score?: {
    strain?: number;
  };
};

/** WHOOP GET /v2/activity/workout record (see developer.whoop.com). */
type WhoopWorkoutApiRecord = {
  id: string;
  start: string;
  end: string;
  timezone_offset?: string;
  sport_name: string;
  sport_id?: number;
  score_state: string;
  score?: {
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
    percent_recorded?: number;
    distance_meter?: number;
    altitude_gain_meter?: number;
    altitude_change_meter?: number;
    zone_durations?: Record<string, number>;
  };
};

function sleepMs(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Inclusive UTC chunks covering [start, end]. */
function* utcDateChunks(start: Date, end: Date, chunkDays: number) {
  const days = Math.max(1, Math.floor(chunkDays));
  let cursor = new Date(start.getTime());
  while (cursor.getTime() < end.getTime()) {
    const chunkEndMs = Math.min(
      cursor.getTime() + days * 86_400_000,
      end.getTime(),
    );
    const chunkEnd = new Date(chunkEndMs);
    yield { start: new Date(cursor), end: chunkEnd };
    cursor = chunkEnd;
  }
}

/**
 * Pull WHOOP workouts across a window in small chunks to avoid 429s.
 * Safe to call independently of recovery sync.
 */
export async function syncWhoopWorkoutsChunked({
  userId,
  connectedAccountId,
  accessToken,
  windowStartAt,
  windowEndAt,
  chunkDays = WHOOP_API_CHUNK_DAYS,
}: {
  userId: string;
  connectedAccountId: string;
  accessToken: string;
  windowStartAt: Date;
  windowEndAt: Date;
  chunkDays?: number;
}): Promise<{ fetched: number; upserted: number }> {
  let fetched = 0;
  let upserted = 0;
  let chunkIndex = 0;
  for (const chunk of utcDateChunks(windowStartAt, windowEndAt, chunkDays)) {
    if (chunkIndex > 0) await sleepMs(1200);
    const w = await syncWhoopWorkoutsInWindow({
      userId,
      connectedAccountId,
      accessToken,
      startIso: chunk.start.toISOString(),
      endIso: chunk.end.toISOString(),
    });
    fetched += w.fetched;
    upserted += w.upserted;
    chunkIndex += 1;
  }
  return { fetched, upserted };
}

async function syncWhoopWorkoutsInWindow({
  userId,
  connectedAccountId,
  accessToken,
  startIso,
  endIso,
}: {
  userId: string;
  connectedAccountId: string;
  accessToken: string;
  startIso: string;
  endIso: string;
}): Promise<{ fetched: number; upserted: number }> {
  let nextToken: string | undefined;
  let fetched = 0;
  let upserted = 0;
  do {
    const q = new URLSearchParams({
      limit: "25",
      start: startIso,
      end: endIso,
    });
    if (nextToken) q.set("nextToken", nextToken);
    const page = (await whoopDeveloperApiGet(
      `/v2/activity/workout?${q.toString()}`,
      accessToken,
    )) as { records?: WhoopWorkoutApiRecord[]; next_token?: string };
    const records = page.records ?? [];
    nextToken = page.next_token;

    for (const rec of records) {
      if (!rec.id || !rec.start || !rec.end || !rec.sport_name) continue;
      const startAt = new Date(rec.start);
      const endAt = new Date(rec.end);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) continue;

      const sc = rec.score;
      const z = sc?.zone_durations;

      await prisma().whoopWorkout.upsert({
        where: {
          userId_providerWorkoutId: {
            userId,
            providerWorkoutId: rec.id,
          },
        },
        create: {
          userId,
          providerWorkoutId: rec.id,
          startAt,
          endAt,
          timezoneOffset: rec.timezone_offset ?? null,
          sportName: rec.sport_name.trim().toLowerCase(),
          sportId: rec.sport_id ?? null,
          scoreState: rec.score_state,
          strain:
            typeof sc?.strain === "number" && Number.isFinite(sc.strain)
              ? sc.strain
              : null,
          averageHeartRateBpm:
            sc?.average_heart_rate != null &&
            Number.isFinite(sc.average_heart_rate)
              ? Math.round(sc.average_heart_rate)
              : null,
          maxHeartRateBpm:
            sc?.max_heart_rate != null && Number.isFinite(sc.max_heart_rate)
              ? Math.round(sc.max_heart_rate)
              : null,
          kilojoule:
            typeof sc?.kilojoule === "number" && Number.isFinite(sc.kilojoule)
              ? sc.kilojoule
              : null,
          percentRecorded:
            typeof sc?.percent_recorded === "number" &&
            Number.isFinite(sc.percent_recorded)
              ? sc.percent_recorded
              : null,
          distanceMeters:
            typeof sc?.distance_meter === "number" &&
            Number.isFinite(sc.distance_meter)
              ? sc.distance_meter
              : null,
          altitudeGainMeters:
            typeof sc?.altitude_gain_meter === "number" &&
            Number.isFinite(sc.altitude_gain_meter)
              ? sc.altitude_gain_meter
              : null,
          altitudeChangeMeters:
            typeof sc?.altitude_change_meter === "number" &&
            Number.isFinite(sc.altitude_change_meter)
              ? sc.altitude_change_meter
              : null,
          zoneDurations: z ? (z as object) : undefined,
          rawPayload: rec as object,
          sourceConnectedAccountId: connectedAccountId,
        },
        update: {
          startAt,
          endAt,
          timezoneOffset: rec.timezone_offset ?? null,
          sportName: rec.sport_name.trim().toLowerCase(),
          sportId: rec.sport_id ?? null,
          scoreState: rec.score_state,
          strain:
            typeof sc?.strain === "number" && Number.isFinite(sc.strain)
              ? sc.strain
              : null,
          averageHeartRateBpm:
            sc?.average_heart_rate != null &&
            Number.isFinite(sc.average_heart_rate)
              ? Math.round(sc.average_heart_rate)
              : null,
          maxHeartRateBpm:
            sc?.max_heart_rate != null && Number.isFinite(sc.max_heart_rate)
              ? Math.round(sc.max_heart_rate)
              : null,
          kilojoule:
            typeof sc?.kilojoule === "number" && Number.isFinite(sc.kilojoule)
              ? sc.kilojoule
              : null,
          percentRecorded:
            typeof sc?.percent_recorded === "number" &&
            Number.isFinite(sc.percent_recorded)
              ? sc.percent_recorded
              : null,
          distanceMeters:
            typeof sc?.distance_meter === "number" &&
            Number.isFinite(sc.distance_meter)
              ? sc.distance_meter
              : null,
          altitudeGainMeters:
            typeof sc?.altitude_gain_meter === "number" &&
            Number.isFinite(sc.altitude_gain_meter)
              ? sc.altitude_gain_meter
              : null,
          altitudeChangeMeters:
            typeof sc?.altitude_change_meter === "number" &&
            Number.isFinite(sc.altitude_change_meter)
              ? sc.altitude_change_meter
              : null,
          zoneDurations: z ? (z as object) : undefined,
          rawPayload: rec as object,
          sourceConnectedAccountId: connectedAccountId,
        },
        select: { id: true },
      });
      fetched += 1;
      upserted += 1;
    }
  } while (nextToken);

  return { fetched, upserted };
}

type DayAgg = {
  recoveryScore: number | null;
  strain: number | null;
  restingHeartRateBpm: number | null;
  hrvRmssdMs: number | null;
  spo2Percentage: number | null;
  skinTempCelsius: number | null;
  sleepMinutes: number | null;
  sleepPerformancePct: number | null;
  sleepEfficiencyPct: number | null;
  sleepConsistencyPct: number | null;
  nap: boolean;
  priority: number;
  raw: Record<string, unknown>;
};

function emptyAgg(): DayAgg {
  return {
    recoveryScore: null,
    strain: null,
    restingHeartRateBpm: null,
    hrvRmssdMs: null,
    spo2Percentage: null,
    skinTempCelsius: null,
    sleepMinutes: null,
    sleepPerformancePct: null,
    sleepEfficiencyPct: null,
    sleepConsistencyPct: null,
    nap: true,
    priority: -1,
    raw: {},
  };
}

function aggPriority(nap: boolean, recoveryScore: number | null): number {
  const rs = recoveryScore ?? 0;
  return (nap ? 0 : 1_000_000) + rs;
}

function shouldReplace(existing: DayAgg, incoming: DayAgg): boolean {
  return incoming.priority > existing.priority;
}

async function syncWhoopRecoveryInWindow({
  userId,
  connectedAccountId,
  accessToken,
  tz,
  startIso,
  endIso,
  cycleCache,
}: {
  userId: string;
  connectedAccountId: string;
  accessToken: string;
  tz: string;
  startIso: string;
  endIso: string;
  cycleCache: Map<number, CycleRow>;
}): Promise<{ fetched: number; upserted: number }> {
  const map = new Map<string, DayAgg>();
  let nextToken: string | undefined;
  let fetched = 0;

  do {
    const q = new URLSearchParams({
      limit: "25",
      start: startIso,
      end: endIso,
    });
    if (nextToken) q.set("nextToken", nextToken);

    const page = (await whoopDeveloperApiGet(
      `/v2/recovery?${q.toString()}`,
      accessToken,
    )) as { records?: RecoveryRow[]; next_token?: string };

    const records = page.records ?? [];
    nextToken = page.next_token;

    for (const rec of records) {
      if (rec.score_state !== "SCORED" || !rec.score) continue;

      let sleep: SleepRow | null = null;
      try {
        sleep = (await whoopDeveloperApiGet(
          `/v2/activity/sleep/${encodeURIComponent(rec.sleep_id)}`,
          accessToken,
        )) as SleepRow;
      } catch {
        continue;
      }

      if (sleep.score_state && sleep.score_state !== "SCORED") continue;
      if (!sleep.end) continue;

      // Pace recovery API calls — sleep+cycle per recovery trips rate limits fast.
      await sleepMs(150);

      const dayDate = isoToUserLocalUtcDate(sleep.end, tz);
      const dayKey = dayDate.toISOString().slice(0, 10);
      const nap = Boolean(sleep.nap);

      const sc = rec.score;
      const recoveryScore =
        sc.recovery_score != null && Number.isFinite(sc.recovery_score)
          ? Math.round(sc.recovery_score)
          : null;
      const incoming: DayAgg = {
        recoveryScore,
        strain: null,
        restingHeartRateBpm:
          sc.resting_heart_rate != null && Number.isFinite(sc.resting_heart_rate)
            ? Math.round(sc.resting_heart_rate)
            : null,
        hrvRmssdMs:
          sc.hrv_rmssd_milli != null && Number.isFinite(sc.hrv_rmssd_milli)
            ? sc.hrv_rmssd_milli
            : null,
        spo2Percentage:
          sc.spo2_percentage != null && Number.isFinite(sc.spo2_percentage)
            ? sc.spo2_percentage
            : null,
        skinTempCelsius:
          sc.skin_temp_celsius != null &&
          Number.isFinite(sc.skin_temp_celsius)
            ? sc.skin_temp_celsius
            : null,
        sleepMinutes: null,
        sleepPerformancePct: null,
        sleepEfficiencyPct: null,
        sleepConsistencyPct: null,
        nap,
        priority: aggPriority(nap, recoveryScore),
        raw: { recovery: rec, sleep },
      };

      const ss = sleep.score?.stage_summary?.total_in_bed_time_milli;
      if (typeof ss === "number" && ss > 0) {
        incoming.sleepMinutes = Math.round(ss / 60000);
      }
      const sp = sleep.score?.sleep_performance_percentage;
      const se = sleep.score?.sleep_efficiency_percentage;
      const scs = sleep.score?.sleep_consistency_percentage;
      if (sp != null && Number.isFinite(sp)) incoming.sleepPerformancePct = sp;
      if (se != null && Number.isFinite(se)) incoming.sleepEfficiencyPct = se;
      if (scs != null && Number.isFinite(scs))
        incoming.sleepConsistencyPct = scs;

      let cycle: CycleRow | undefined = cycleCache.get(rec.cycle_id);
      if (!cycle) {
        try {
          cycle = (await whoopDeveloperApiGet(
            `/v2/cycle/${rec.cycle_id}`,
            accessToken,
          )) as CycleRow;
          cycleCache.set(rec.cycle_id, cycle);
        } catch {
          cycle = undefined;
        }
      }

      if (cycle?.score_state === "SCORED" && cycle.score?.strain != null) {
        const st = cycle.score.strain;
        if (typeof st === "number" && Number.isFinite(st)) {
          incoming.strain = st;
        }
      }

      const existing = map.get(dayKey);
      if (!existing || shouldReplace(existing, incoming)) {
        map.set(dayKey, incoming);
      }

      fetched += 1;
    }
  } while (nextToken);

  let upserted = 0;
  for (const [dayKey, agg] of map) {
    const [y, mo, d] = dayKey.split("-").map(Number);
    if (!y || !mo || !d) continue;
    const date = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));

    await prisma().dailyWhoopStat.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        recoveryScore: agg.recoveryScore,
        strain: agg.strain,
        restingHeartRateBpm: agg.restingHeartRateBpm,
        hrvRmssdMs: agg.hrvRmssdMs,
        spo2Percentage: agg.spo2Percentage,
        skinTempCelsius: agg.skinTempCelsius,
        sleepMinutes: agg.sleepMinutes,
        sleepPerformancePct: agg.sleepPerformancePct,
        sleepEfficiencyPct: agg.sleepEfficiencyPct,
        sleepConsistencyPct: agg.sleepConsistencyPct,
        rawPayload: agg.raw as object,
        sourceConnectedAccountId: connectedAccountId,
      },
      update: {
        recoveryScore: agg.recoveryScore,
        strain: agg.strain,
        restingHeartRateBpm: agg.restingHeartRateBpm,
        hrvRmssdMs: agg.hrvRmssdMs,
        spo2Percentage: agg.spo2Percentage,
        skinTempCelsius: agg.skinTempCelsius,
        sleepMinutes: agg.sleepMinutes,
        sleepPerformancePct: agg.sleepPerformancePct,
        sleepEfficiencyPct: agg.sleepEfficiencyPct,
        sleepConsistencyPct: agg.sleepConsistencyPct,
        rawPayload: agg.raw as object,
        sourceConnectedAccountId: connectedAccountId,
      },
      select: { id: true },
    });
    upserted += 1;
  }

  return { fetched, upserted };
}

/**
 * Pull WHOOP recovery/sleep/strain day rows in small chunks to avoid 429s.
 */
export async function syncWhoopRecoveryChunked({
  userId,
  connectedAccountId,
  accessToken,
  tz,
  windowStartAt,
  windowEndAt,
  chunkDays = 7,
}: {
  userId: string;
  connectedAccountId: string;
  accessToken: string;
  tz: string;
  windowStartAt: Date;
  windowEndAt: Date;
  chunkDays?: number;
}): Promise<{ fetched: number; upserted: number }> {
  const cycleCache = new Map<number, CycleRow>();
  let fetched = 0;
  let upserted = 0;
  let chunkIndex = 0;
  for (const chunk of utcDateChunks(windowStartAt, windowEndAt, chunkDays)) {
    if (chunkIndex > 0) await sleepMs(2500);
    try {
      const r = await syncWhoopRecoveryInWindow({
        userId,
        connectedAccountId,
        accessToken,
        tz,
        startIso: chunk.start.toISOString(),
        endIso: chunk.end.toISOString(),
        cycleCache,
      });
      fetched += r.fetched;
      upserted += r.upserted;
      console.log(
        `[whoop-recovery] chunk ${chunk.start.toISOString().slice(0, 10)} → ${chunk.end.toISOString().slice(0, 10)} fetched=${r.fetched} upserted=${r.upserted}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[whoop-recovery] chunk failed ${chunk.start.toISOString().slice(0, 10)}: ${msg}`,
      );
      // Continue remaining chunks even if one hits a transient 429.
      await sleepMs(5000);
    }
    chunkIndex += 1;
  }
  return { fetched, upserted };
}

export async function syncWhoopDailyStats({
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
  const user = await prisma().user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone?.trim() || "UTC";

  const daysClamped =
    Number.isFinite(days) && days > 0
      ? Math.min(days, MAX_WHOOP_SYNC_DAYS)
      : 90;

  const windowEndAt = new Date();
  const windowStartAt = utcInclusiveWindowStart(windowEndAt, daysClamped);

  // Workouts first (lighter API). Chunked so summer history can backfill without 429.
  let workoutsFetched = 0;
  let workoutsUpserted = 0;
  try {
    const w = await syncWhoopWorkoutsChunked({
      userId,
      connectedAccountId,
      accessToken,
      windowStartAt,
      windowEndAt,
    });
    workoutsFetched = w.fetched;
    workoutsUpserted = w.upserted;
  } catch {
    // Missing read:workout scope or temporary API error — recovery sync may still succeed.
  }

  let profileWeightKg: number | null = null;
  try {
    const body = (await whoopDeveloperApiGet(
      "/v2/user/measurement/body",
      accessToken,
    )) as { weight_kilogram?: number };
    if (
      typeof body.weight_kilogram === "number" &&
      Number.isFinite(body.weight_kilogram) &&
      body.weight_kilogram > 0
    ) {
      profileWeightKg = body.weight_kilogram;
    }
  } catch {
    // Missing read:body_measurement scope or API error — leave weight null
  }

  let fetched = 0;
  let upserted = 0;
  try {
    const r = await syncWhoopRecoveryChunked({
      userId,
      connectedAccountId,
      accessToken,
      tz,
      windowStartAt,
      windowEndAt,
      chunkDays: 7,
    });
    fetched = r.fetched;
    upserted = r.upserted;
  } catch {
    // Recovery may partially fail; workouts already saved above.
  }

  // Weight is a point-in-time measurement. Store the current weight on the user's
  // current local day (day of the pull) instead of stamping the whole window.
  if (profileWeightKg != null) {
    const todayLocal = isoToUserLocalUtcDate(new Date().toISOString(), tz);
    await prisma().dailyWhoopStat.upsert({
      where: { userId_date: { userId, date: todayLocal } },
      create: {
        userId,
        date: todayLocal,
        weightKg: profileWeightKg,
        rawPayload: { whoop_body_measurement: { weightKg: profileWeightKg } } as object,
        sourceConnectedAccountId: connectedAccountId,
      },
      update: {
        weightKg: profileWeightKg,
        sourceConnectedAccountId: connectedAccountId,
      },
      select: { id: true },
    });
  }

  await prisma().connectedAccount.update({
    where: { id: connectedAccountId },
    data: { lastSyncedAt: new Date() },
  });

  try {
    await recomputeMonthlyFitnessSnapshots(userId);
  } catch {
    // best-effort
  }

  return {
    fetched,
    upserted,
    days: daysClamped,
    workoutsFetched,
    workoutsUpserted,
  };
}

export type WhoopSyncWithLogResult =
  | {
      ok: true;
      fetched: number;
      upserted: number;
      days: number;
      workoutsFetched: number;
      workoutsUpserted: number;
    }
  | { ok: false; error: string };

export async function syncWhoopDailyStatsWithLog({
  userId,
  connectedAccountId,
  days,
  getAccessToken,
}: {
  userId: string;
  connectedAccountId: string;
  days: number;
  getAccessToken: () => Promise<string | null>;
}): Promise<WhoopSyncWithLogResult> {
  const daysClamped =
    Number.isFinite(days) && days > 0
      ? Math.min(days, MAX_WHOOP_SYNC_DAYS)
      : 90;
  const startedAt = new Date();
  const windowEndAt = new Date();
  const windowStartAt = utcInclusiveWindowStart(windowEndAt, daysClamped);

  const syncLog = await prisma().syncLog.create({
    data: {
      userId,
      provider: "WHOOP",
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
      const msg = "WHOOP not connected";
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

    const result = await syncWhoopDailyStats({
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
      workoutsFetched: result.workoutsFetched,
      workoutsUpserted: result.workoutsUpserted,
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
