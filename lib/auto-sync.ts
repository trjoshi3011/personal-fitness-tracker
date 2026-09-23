import { prisma } from "@/lib/db";
import { getValidStravaAccessTokenForUser } from "@/lib/strava";
import { getValidWhoopAccessTokenForUser } from "@/lib/whoop";
import { syncStravaActivitiesWithLog } from "@/lib/strava-sync";
import { syncWhoopDailyStatsWithLog } from "@/lib/whoop-sync";
import { normalizeUserTimezone } from "@/lib/user-timezone";
import { startOfZonedCalendarDay } from "@/lib/zoned-calendar";

/**
 * Auto-sync runs once at end of each user's local calendar day (hour 23 in
 * their IANA timezone). A user is "due" when:
 *   1. Their local time is currently in hour 23 (handles 30 / 45 min offsets).
 *   2. They have an active STRAVA or WHOOP `ConnectedAccount`.
 *   3. No `SUCCESS` `SyncLog` exists for that provider since the start of their
 *      local calendar day.
 *
 * The external cron (see `vercel.json` / any scheduler) is expected to invoke
 * this every ~30 minutes — the local-hour-23 check plus the same-day SyncLog
 * dedupe ensures each user gets exactly one auto-sync per local day.
 */

/** A small lookback covers any retroactive edits without re-pulling years. */
const AUTO_SYNC_DAYS = 14;

const PROVIDERS = ["STRAVA", "WHOOP"] as const;
type AutoSyncProvider = (typeof PROVIDERS)[number];

function localTimeParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const n = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value);
  return {
    y: n("year"),
    m: n("month"),
    d: n("day"),
    h: n("hour"),
    min: n("minute"),
  };
}

export type AutoSyncRunResult = {
  ranAt: string;
  triggered: Array<{
    userId: string;
    provider: AutoSyncProvider;
    ok: boolean;
    fetched?: number;
    upserted?: number;
    error?: string;
  }>;
  skipped: Array<{
    userId: string;
    reason:
      | "not-in-23h-window"
      | "already-synced-today"
      | "provider-not-connected";
    provider?: AutoSyncProvider;
    localHour?: number;
  }>;
};

/**
 * Scan all users with at least one active STRAVA/WHOOP account and trigger
 * auto-sync for those whose local time is currently at the end of the day and
 * who have not yet successfully synced for that local calendar day.
 *
 * Caller is responsible for auth (e.g. cron secret). Throws on infrastructure
 * errors but never on per-user failures — those are recorded in `triggered`.
 */
export async function runAutoSyncForDueUsers(
  now: Date = new Date(),
): Promise<AutoSyncRunResult> {
  const users = await prisma().user.findMany({
    where: {
      connectedAccounts: {
        some: {
          isActive: true,
          provider: { in: ["STRAVA", "WHOOP"] },
        },
      },
    },
    select: {
      id: true,
      timezone: true,
      connectedAccounts: {
        where: {
          isActive: true,
          provider: { in: ["STRAVA", "WHOOP"] },
        },
        select: { id: true, provider: true },
      },
    },
  });

  const result: AutoSyncRunResult = {
    ranAt: now.toISOString(),
    triggered: [],
    skipped: [],
  };

  for (const user of users) {
    const tz = normalizeUserTimezone(user.timezone);
    const local = localTimeParts(now, tz);

    // We only fire during the last hour of the user's local day. Combined with
    // a ~30-minute cron cadence this still hits every IANA timezone (incl. the
    // 30 / 45 min offsets) before midnight.
    if (local.h !== 23) {
      result.skipped.push({
        userId: user.id,
        reason: "not-in-23h-window",
        localHour: local.h,
      });
      continue;
    }

    const localDayStart = startOfZonedCalendarDay(local.y, local.m, local.d, tz);

    for (const provider of PROVIDERS) {
      const account = user.connectedAccounts.find((a) => a.provider === provider);
      if (!account) {
        result.skipped.push({
          userId: user.id,
          reason: "provider-not-connected",
          provider,
        });
        continue;
      }

      const existing = await prisma().syncLog.findFirst({
        where: {
          userId: user.id,
          provider,
          status: "SUCCESS",
          startedAt: { gte: localDayStart },
        },
        select: { id: true },
      });
      if (existing) {
        result.skipped.push({
          userId: user.id,
          reason: "already-synced-today",
          provider,
        });
        continue;
      }

      try {
        if (provider === "STRAVA") {
          const r = await syncStravaActivitiesWithLog({
            userId: user.id,
            connectedAccountId: account.id,
            days: AUTO_SYNC_DAYS,
            getAccessToken: () => getValidStravaAccessTokenForUser(user.id),
          });
          if (r.ok) {
            result.triggered.push({
              userId: user.id,
              provider,
              ok: true,
              fetched: r.fetched,
              upserted: r.upserted,
            });
          } else {
            result.triggered.push({
              userId: user.id,
              provider,
              ok: false,
              error: r.error,
            });
          }
        } else {
          const r = await syncWhoopDailyStatsWithLog({
            userId: user.id,
            connectedAccountId: account.id,
            days: AUTO_SYNC_DAYS,
            getAccessToken: () => getValidWhoopAccessTokenForUser(user.id),
          });
          if (r.ok) {
            result.triggered.push({
              userId: user.id,
              provider,
              ok: true,
              fetched: r.fetched,
              upserted: r.upserted,
            });
          } else {
            result.triggered.push({
              userId: user.id,
              provider,
              ok: false,
              error: r.error,
            });
          }
        }
      } catch (err) {
        result.triggered.push({
          userId: user.id,
          provider,
          ok: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  return result;
}
