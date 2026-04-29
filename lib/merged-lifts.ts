import { prisma } from "@/lib/db";
import type { WhoopLiftingRow } from "@/lib/whoop-lifting-queries";
import { fetchWhoopLiftingWorkoutsInRange } from "@/lib/whoop-lifting-queries";

export type MergedLiftRow =
  | (WhoopLiftingRow & { source: "WHOOP" })
  | {
      source: "STRAVA";
      id: string;
      providerActivityId: string;
      startAt: Date;
      endAt: Date;
      sportName: string;
      scoreState: "STRAVA";
      strain: null;
      averageHeartRateBpm: number | null;
      maxHeartRateBpm: number | null;
      kilojoule: null;
      percentRecorded: null;
      zoneDurations: null;
      liftSessionTemplate: null;
    };

const STRAVA_LIFT_TYPES = new Set([
  "WeightTraining",
  "Workout",
  "Crossfit",
  "HIIT",
  "StrengthTraining",
]);

function isStravaLift(a: { type: string | null; sportType: string | null }) {
  const t = a.type?.trim() ?? "";
  const s = a.sportType?.trim() ?? "";
  return STRAVA_LIFT_TYPES.has(t) || STRAVA_LIFT_TYPES.has(s);
}

function endAtFromStrava(a: { startAt: Date; elapsedTimeSec: number | null; movingTimeSec: number | null }) {
  const sec =
    (typeof a.elapsedTimeSec === "number" && Number.isFinite(a.elapsedTimeSec) && a.elapsedTimeSec > 0
      ? a.elapsedTimeSec
      : null) ??
    (typeof a.movingTimeSec === "number" && Number.isFinite(a.movingTimeSec) && a.movingTimeSec > 0
      ? a.movingTimeSec
      : 0);
  return new Date(a.startAt.getTime() + sec * 1000);
}

function likelySameSession(
  a: { startAt: Date; endAt: Date },
  b: { startAt: Date; endAt: Date },
) {
  const startDiffMin = Math.abs(a.startAt.getTime() - b.startAt.getTime()) / 60_000;
  if (startDiffMin > 10) return false;
  const durA = Math.max(0, a.endAt.getTime() - a.startAt.getTime());
  const durB = Math.max(0, b.endAt.getTime() - b.startAt.getTime());
  const durDiffMin = Math.abs(durA - durB) / 60_000;
  return durDiffMin <= 20;
}

export async function fetchMergedLiftsInRange(
  userId: string,
  start: Date,
  end: Date,
): Promise<MergedLiftRow[]> {
  const [whoop, stravaRaw] = await Promise.all([
    fetchWhoopLiftingWorkoutsInRange(userId, start, end),
    prisma().stravaActivity.findMany({
      where: { userId, startAt: { gte: start, lt: end } },
      select: {
        id: true,
        providerActivityId: true,
        name: true,
        type: true,
        sportType: true,
        startAt: true,
        elapsedTimeSec: true,
        movingTimeSec: true,
        averageHrBpm: true,
        maxHrBpm: true,
      },
      orderBy: { startAt: "desc" },
    }),
  ]);

  const whoopRows: MergedLiftRow[] = whoop.map((w) => ({ ...w, source: "WHOOP" as const }));

  const stravaCandidates = stravaRaw
    .filter(isStravaLift)
    .map((a) => {
      const endAt = endAtFromStrava(a);
      const sportName = a.sportType ?? a.type ?? "Strength";
      return {
        source: "STRAVA" as const,
        id: a.id,
        providerActivityId: a.providerActivityId,
        startAt: a.startAt,
        endAt,
        sportName,
        scoreState: "STRAVA" as const,
        strain: null,
        averageHeartRateBpm: a.averageHrBpm,
        maxHeartRateBpm: a.maxHrBpm,
        kilojoule: null,
        percentRecorded: null,
        zoneDurations: null,
        liftSessionTemplate: null,
      };
    });

  const dedupedStrava: MergedLiftRow[] = [];
  for (const s of stravaCandidates) {
    const matchesWhoop = whoopRows.some((w) => likelySameSession(w, s));
    if (!matchesWhoop) dedupedStrava.push(s);
  }

  const out = [...whoopRows, ...dedupedStrava];
  out.sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  return out;
}

export async function fetchMergedLiftStartsInRange(
  userId: string,
  start: Date,
  end: Date,
): Promise<Date[]> {
  const rows = await fetchMergedLiftsInRange(userId, start, end);
  return rows.map((r) => r.startAt).sort((a, b) => a.getTime() - b.getTime());
}

