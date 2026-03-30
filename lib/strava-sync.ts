import { prisma } from "@/lib/db";
import { recomputeMonthlyFitnessSnapshots } from "@/lib/monthly-snapshots";
import { MAX_STRAVA_SYNC_DAYS } from "@/lib/sync-constants";

type StravaActivityApi = {
  id: number;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date: string;
  start_date_local?: string;
  timezone?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number;
  weighted_average_watts?: number;
} & Record<string, unknown>;

async function fetchActivitiesPage(
  accessToken: string,
  afterUnixSeconds: number,
  page: number,
) {
  const qs = new URLSearchParams({
    after: String(afterUnixSeconds),
    per_page: "200",
    page: String(page),
  });

  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?${qs.toString()}`,
    {
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );

  const json = (await res.json().catch(() => null)) as StravaActivityApi[] | null;
  if (!res.ok || !json) {
    const message =
      typeof (json as any)?.message === "string"
        ? (json as any).message
        : `Strava activities fetch failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}

/** Pages through Strava activities (200 per page) for long-term backfill. */
async function fetchAllActivities(accessToken: string, afterUnixSeconds: number) {
  const all: StravaActivityApi[] = [];
  const maxPages = 100;
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchActivitiesPage(accessToken, afterUnixSeconds, page);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 200) break;
  }
  return all;
}

function activityPayload(a: StravaActivityApi) {
  return {
    calories:
      typeof a.calories === "number" && Number.isFinite(a.calories)
        ? Math.round(a.calories)
        : null,
    weightedAverageWatts:
      typeof a.weighted_average_watts === "number" &&
      Number.isFinite(a.weighted_average_watts)
        ? Math.round(a.weighted_average_watts)
        : null,
  };
}

export async function syncStravaActivities({
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
      ? Math.min(days, MAX_STRAVA_SYNC_DAYS)
      : 90;
  const after = Math.floor(Date.now() / 1000) - daysClamped * 24 * 60 * 60;

  const activities = await fetchAllActivities(accessToken, after);

  let upserted = 0;
  for (const a of activities) {
    const extra = activityPayload(a);
    await prisma().stravaActivity.upsert({
      where: {
        userId_providerActivityId: {
          userId,
          providerActivityId: String(a.id),
        },
      },
      create: {
        userId,
        providerActivityId: String(a.id),
        name: a.name ?? null,
        type: a.type ?? null,
        sportType: a.sport_type ?? null,
        startAt: new Date(a.start_date),
        startDateLocal: a.start_date_local
          ? new Date(a.start_date_local)
          : null,
        timezone: a.timezone ?? null,
        distanceMeters: a.distance ? Math.round(a.distance) : null,
        movingTimeSec: a.moving_time ?? null,
        elapsedTimeSec: a.elapsed_time ?? null,
        totalElevationM: a.total_elevation_gain ?? null,
        averageSpeedMps: a.average_speed ?? null,
        averageHrBpm: a.average_heartrate
          ? Math.round(a.average_heartrate)
          : null,
        maxHrBpm: a.max_heartrate ? Math.round(a.max_heartrate) : null,
        ...extra,
        rawPayload: a as unknown as object,
        sourceConnectedAccountId: connectedAccountId,
      },
      update: {
        name: a.name ?? null,
        type: a.type ?? null,
        sportType: a.sport_type ?? null,
        startAt: new Date(a.start_date),
        startDateLocal: a.start_date_local
          ? new Date(a.start_date_local)
          : null,
        timezone: a.timezone ?? null,
        distanceMeters: a.distance ? Math.round(a.distance) : null,
        movingTimeSec: a.moving_time ?? null,
        elapsedTimeSec: a.elapsed_time ?? null,
        totalElevationM: a.total_elevation_gain ?? null,
        averageSpeedMps: a.average_speed ?? null,
        averageHrBpm: a.average_heartrate
          ? Math.round(a.average_heartrate)
          : null,
        maxHrBpm: a.max_heartrate ? Math.round(a.max_heartrate) : null,
        ...extra,
        rawPayload: a as unknown as object,
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
    await recomputeMonthlyFitnessSnapshots(userId);
  } catch {
    // Rollups are best-effort; raw activities are already saved.
  }

  return { fetched: activities.length, upserted, days: daysClamped };
}

export type StravaSyncWithLogResult =
  | { ok: true; fetched: number; upserted: number; days: number }
  | { ok: false; error: string };

export async function syncStravaActivitiesWithLog({
  userId,
  connectedAccountId,
  days,
  getAccessToken,
}: {
  userId: string;
  connectedAccountId: string;
  days: number;
  getAccessToken: () => Promise<string | null>;
}): Promise<StravaSyncWithLogResult> {
  const daysClamped =
    Number.isFinite(days) && days > 0
      ? Math.min(days, MAX_STRAVA_SYNC_DAYS)
      : 90;
  const startedAt = new Date();

  const syncLog = await prisma().syncLog.create({
    data: {
      userId,
      provider: "STRAVA",
      status: "PARTIAL",
      startedAt,
      windowStartAt: new Date(Date.now() - daysClamped * 24 * 60 * 60 * 1000),
      windowEndAt: new Date(),
      connectedAccountId,
      fetchedCount: 0,
      upsertedCount: 0,
    },
    select: { id: true },
  });

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      const msg = "Strava not connected";
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

    const result = await syncStravaActivities({
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
