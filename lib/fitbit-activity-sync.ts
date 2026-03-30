import { prisma } from "@/lib/db";
import {
  MAX_FITBIT_RUN_LOG_DAYS,
  utcInclusiveWindowStart,
} from "@/lib/sync-constants";

function formatFitbitDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Calendar months (UTC) from `a` through `b` inclusive; empty if range invalid. */
function listUtcMonthsInclusive(a: Date, b: Date): { y: number; m: number }[] {
  if (a.getTime() > b.getTime()) return [];
  const out: { y: number; m: number }[] = [];
  let y = a.getUTCFullYear();
  let m = a.getUTCMonth() + 1;
  const endY = b.getUTCFullYear();
  const endM = b.getUTCMonth() + 1;
  for (;;) {
    out.push({ y, m });
    if (y === endY && m === endM) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function utcMonthBounds(y: number, month1to12: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(y, month1to12 - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, month1to12, 0, 23, 59, 59, 999));
  return { start, end };
}

/** Fitbit list item — we only persist running-like activities. */
type FitbitListActivity = {
  logId?: number;
  activityName?: string;
  activityTypeId?: number;
  startTime?: string;
  duration?: number;
  originalDuration?: number;
  distance?: number;
  distanceUnit?: string;
  elevationGain?: number;
  averageHeartRate?: number;
  calories?: number;
  logType?: string;
} & Record<string, unknown>;

type FitbitListResponse = {
  activities?: FitbitListActivity[];
  pagination?: { next?: string };
};

function isRunLikeActivity(a: FitbitListActivity): boolean {
  const name = (a.activityName ?? "").toLowerCase();
  // Fitbit often uses "Running" — /\brun\b/ does NOT match that substring.
  if (name.includes("run") || name.includes("jog")) return true;
  if (name.includes("treadmill")) return true;
  // Common Fitbit activity type ids (running / treadmill).
  const id = a.activityTypeId;
  if (id === 90009 || id === 91060) return true;
  return false;
}

function distanceToMeters(
  distance: number | undefined,
  unit: string | undefined,
): number | null {
  if (distance == null || !Number.isFinite(distance)) return null;
  const u = (unit ?? "").toLowerCase();
  if (u.includes("kilometer") || u === "km") return Math.round(distance * 1000);
  if (u.includes("mile")) return Math.round(distance * 1609.344);
  if (u.includes("meter") || u === "m") return Math.round(distance);
  return Math.round(distance * 1000);
}

/**
 * Pulls Fitbit exercise logs (activity list API) and stores running-like entries.
 * Pagination follows `pagination.next` from Fitbit. Complements Strava sync for
 * historical tracker / MobileRun sessions.
 */
export async function syncFitbitRunActivityLogs({
  userId,
  connectedAccountId,
  accessToken,
  days,
}: {
  userId: string;
  connectedAccountId: string;
  accessToken: string;
  days: number;
}): Promise<{ fetched: number; upserted: number }> {
  const daysClamped =
    Number.isFinite(days) && days > 0
      ? Math.min(days, MAX_FITBIT_RUN_LOG_DAYS)
      : 90;

  const syncEnd = new Date();
  const syncStart = utcInclusiveWindowStart(syncEnd, daysClamped);

  let fetched = 0;
  let upserted = 0;

  const months = listUtcMonthsInclusive(syncStart, syncEnd);
  const maxPagesPerMonth = 120;

  for (const { y, m } of months) {
    const { start: monthStart, end: monthEnd } = utcMonthBounds(y, m);
    const listAfter = new Date(
      Math.max(monthStart.getTime(), syncStart.getTime()),
    );
    const afterDateStr = formatFitbitDate(listAfter);

    const params = new URLSearchParams({
      afterDate: afterDateStr,
      sort: "asc",
      offset: "0",
      limit: "100",
    });

    let nextUrl: string | null =
      `https://api.fitbit.com/1/user/-/activities/list.json?${params.toString()}`;

    for (let page = 0; page < maxPagesPerMonth && nextUrl; page++) {
      const res = await fetch(nextUrl, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
          "accept-language": "en_US",
        },
      });

      const body = (await res.json().catch(() => null)) as FitbitListResponse | null;
      if (!res.ok || !body) {
        break;
      }

      const activities = body.activities ?? [];
      fetched += activities.length;

      let hitLaterMonth = false;

      for (const a of activities) {
        const startTime = a.startTime;
        if (typeof startTime !== "string") continue;

        const startAt = new Date(startTime);
        if (Number.isNaN(startAt.getTime())) continue;

        if (startAt > monthEnd) {
          hitLaterMonth = true;
          continue;
        }

        if (startAt < syncStart || startAt > syncEnd) continue;

        if (!isRunLikeActivity(a)) continue;
        const logId = a.logId;
        if (logId == null || !Number.isFinite(logId)) continue;

        const durationMs =
          typeof a.duration === "number" && Number.isFinite(a.duration)
            ? Math.round(a.duration)
            : typeof a.originalDuration === "number" &&
                Number.isFinite(a.originalDuration)
              ? Math.round(a.originalDuration)
              : null;

        const distanceMeters = distanceToMeters(a.distance, a.distanceUnit);
        const elev =
          typeof a.elevationGain === "number" && Number.isFinite(a.elevationGain)
            ? a.elevationGain
            : null;
        const avgHr =
          typeof a.averageHeartRate === "number" &&
          Number.isFinite(a.averageHeartRate)
            ? Math.round(a.averageHeartRate)
            : null;

        await prisma().fitbitActivityLog.upsert({
          where: {
            userId_logId: { userId, logId: String(logId) },
          },
          create: {
            userId,
            logId: String(logId),
            activityName: a.activityName ?? null,
            activityTypeId: a.activityTypeId ?? null,
            startAt,
            durationMs,
            distanceMeters,
            elevationGainM: elev,
            averageHeartRateBpm: avgHr,
            maxHeartRateBpm: null,
            calories:
              typeof a.calories === "number" && Number.isFinite(a.calories)
                ? Math.round(a.calories)
                : null,
            logType: typeof a.logType === "string" ? a.logType : null,
            rawPayload: a as object,
            sourceConnectedAccountId: connectedAccountId,
          },
          update: {
            activityName: a.activityName ?? null,
            activityTypeId: a.activityTypeId ?? null,
            startAt,
            durationMs,
            distanceMeters,
            elevationGainM: elev,
            averageHeartRateBpm: avgHr,
            calories:
              typeof a.calories === "number" && Number.isFinite(a.calories)
                ? Math.round(a.calories)
                : null,
            logType: typeof a.logType === "string" ? a.logType : null,
            rawPayload: a as object,
            sourceConnectedAccountId: connectedAccountId,
          },
          select: { id: true },
        });
        upserted += 1;
      }

      if (hitLaterMonth) {
        break;
      }

      const nxt = body.pagination?.next;
      nextUrl =
        typeof nxt === "string" && nxt.trim().length > 0 ? nxt.trim() : null;

      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return { fetched, upserted };
}
