import { prisma } from "@/lib/db";
import { getValidStravaAccessTokenForUser } from "@/lib/strava";
import { getValidWhoopAccessTokenForUser } from "@/lib/whoop";
import { syncStravaActivitiesWithLog } from "@/lib/strava-sync";
import { syncWhoopDailyStatsWithLog } from "@/lib/whoop-sync";
import { normalizeUserTimezone } from "@/lib/user-timezone";
import { startOfZonedCalendarDay } from "@/lib/zoned-calendar";

/**
 * Vercel Hobby invokes this once daily (see vercel.json). Every user with an
 * active STRAVA or WHOOP account is eligible, regardless of their local hour.
 * A successful provider SyncLog since the start of the user's local calendar
 * day suppresses duplicate work, including after a manual sync.
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
  }).formatToParts(d);
  const n = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value);
  return {
    y: n("year"),
    m: n("month"),
    d: n("day"),
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
    reason: "already-synced-today" | "provider-not-connected";
    provider?: AutoSyncProvider;
  }>;
};

/**
 * Scan all users with at least one active STRAVA/WHOOP account and trigger
 * auto-sync for providers not yet successfully synced that local calendar day.
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
