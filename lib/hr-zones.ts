/**
 * HR zone definitions and per-activity time-in-zone aggregation.
 *
 * The classic 5-zone model is used by default ("percent_max" — 50/60/70/80/90/100% of HR max).
 * Schemes are explicit so they round-trip through the cache table; if you change a
 * scheme later, cached rows with the old scheme are invalidated automatically.
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export type HrZoneSchemeKey = "percent_max" | "percent_threshold";

export type HrZoneScheme = {
  key: HrZoneSchemeKey;
  /**
   * Lower-bound percentages for each of the five zones, in order.
   * Z1 starts at boundaries[0], Z5 ends at 100% (i.e. hrMax).
   */
  boundaries: [number, number, number, number, number];
  description: string;
};

export const HR_ZONE_SCHEMES: Record<HrZoneSchemeKey, HrZoneScheme> = {
  percent_max: {
    key: "percent_max",
    // Z1 50–60%, Z2 60–70%, Z3 70–80%, Z4 80–90%, Z5 90–100% of hrMax.
    boundaries: [0.5, 0.6, 0.7, 0.8, 0.9],
    description: "Classic 5-zone model as % of max HR (50/60/70/80/90).",
  },
  percent_threshold: {
    key: "percent_threshold",
    // Reasonable threshold-anchored split; only used when caller provides an LT HR.
    boundaries: [0.56, 0.713, 0.785, 0.857, .928],
    description: "5-zone model anchored to lactate threshold HR (uses %LTHR).",
  },
};

/** Estimate hrMax from age (220 - age). Caller may use this to populate defaults. */
export function estimateHrMaxFromAge(age: number): number {
  return Math.max(120, Math.min(220, Math.round(220 - age)));
}

/** Compute the zone edges (bpm) for an athlete given the scheme + reference HRs. */
export function computeZoneEdgesBpm(args: {
  scheme: HrZoneSchemeKey;
  hrMaxBpm: number;
  /** Resting HR (bpm). When provided and using percent_max, we use Karvonen HRR. */
  hrRestBpm?: number | null;
  /** For percent_threshold scheme. Ignored otherwise. */
  hrThresholdBpm?: number | null;
}): number[] {
  const scheme = HR_ZONE_SCHEMES[args.scheme] ?? HR_ZONE_SCHEMES.percent_max;
  const hrRest =
    typeof args.hrRestBpm === "number" && args.hrRestBpm >= 30 && args.hrRestBpm <= 110
      ? args.hrRestBpm
      : null;

  const anchor =
    scheme.key === "percent_threshold" && args.hrThresholdBpm && args.hrThresholdBpm > 90
      ? args.hrThresholdBpm
      : args.hrMaxBpm;

  const hrr = hrRest != null ? Math.max(1, args.hrMaxBpm - hrRest) : null;

  const lows = scheme.boundaries.map((b) => {
    // If we know resting HR and we're using %max scheme, use Karvonen HRR:
    // HR = HRrest + p * (HRmax - HRrest).
    if (scheme.key === "percent_max" && hrRest != null && hrr != null) {
      return Math.round(hrRest + b * hrr);
    }
    return Math.round(anchor * b);
  });
  // Top edge of the last zone is hrMax (or the threshold-derived top), rounded up.
  const top =
    scheme.key === "percent_threshold"
      ? Math.max(args.hrMaxBpm, Math.round(anchor * 1.1))
      : args.hrMaxBpm;
  return [...lows, top];
}

export type HrZoneAggregate = {
  zoneEdgesBpm: number[];
  zoneDurationsSec: number[];
  totalSeconds: number;
  observedMaxBpm: number;
};

/**
 * Bucket adjacent (time, hr) samples into zones using `dt = t[i+1] - t[i]`.
 * Drops samples with implausible HR or unrealistic time gaps (> 120 s) so a
 * paused activity doesn't inflate any one zone.
 */
export function aggregateHrZones(args: {
  timeSec: number[];
  hrBpm: number[];
  zoneEdgesBpm: number[];
}): HrZoneAggregate {
  const { timeSec, hrBpm, zoneEdgesBpm } = args;
  const numZones = Math.max(1, zoneEdgesBpm.length - 1);
  const acc = new Array<number>(numZones).fill(0);
  const n = Math.min(timeSec.length, hrBpm.length);
  let observedMax = 0;
  let total = 0;

  for (let i = 0; i < n - 1; i++) {
    const h = hrBpm[i];
    if (h == null || !Number.isFinite(h) || h <= 40 || h > 230) continue;
    if (h > observedMax) observedMax = h;
    let dt = timeSec[i + 1] - timeSec[i];
    if (!Number.isFinite(dt) || dt <= 0) dt = 1;
    if (dt > 120) continue;
    let zi = 0;
    for (let z = numZones - 1; z >= 0; z--) {
      if (h >= zoneEdgesBpm[z]) {
        zi = z;
        break;
      }
    }
    acc[zi] += dt;
    total += dt;
  }

  return {
    zoneEdgesBpm,
    zoneDurationsSec: acc.map((s) => Math.round(s)),
    totalSeconds: Math.round(total),
    observedMaxBpm: observedMax,
  };
}

type StravaStream = { type?: string; data?: unknown };

function parseStreamsPayload(json: unknown): { time: number[]; hr: number[] } | null {
  if (!Array.isArray(json)) return null;
  let time: number[] | null = null;
  let hr: number[] | null = null;
  for (const s of json as StravaStream[]) {
    if (!s || typeof s !== "object") continue;
    const data = s.data;
    if (!Array.isArray(data)) continue;
    const nums = data.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    if (s.type === "time") time = nums;
    if (s.type === "heartrate") hr = nums;
  }
  if (!time?.length || !hr?.length) return null;
  const cap = Math.min(time.length, hr.length);
  return { time: time.slice(0, cap), hr: hr.slice(0, cap) };
}

export type FetchActivityZonesResult =
  | { ok: true; cached: boolean; aggregate: HrZoneAggregate; schemeKey: HrZoneSchemeKey; hrMaxBpm: number }
  | { ok: false; reason: "no_hr_profile" | "no_streams" | "stream_error"; message: string };

/**
 * Returns the cached per-activity time-in-zone if (scheme, hrMax, hrRest) matches
 * the user's current profile; otherwise fetches HR streams from Strava and recomputes.
 */
export async function fetchOrComputeActivityHrZones(args: {
  userId: string;
  providerActivityId: string;
  accessToken: string | null;
  /** From DB row; used to anchor the upper end of Z5 nicely. */
  activityMaxHrBpm: number | null;
}): Promise<FetchActivityZonesResult> {
  // TS server can lag behind Prisma generate in dev; keep these queries resilient.
  const user = (await (prisma() as any).user.findUnique({
    where: { id: args.userId },
    select: { hrMaxBpm: true, hrRestBpm: true, hrZoneScheme: true },
  })) as { hrMaxBpm: number | null; hrRestBpm: number | null; hrZoneScheme: string | null } | null;
  if (!user || !user.hrMaxBpm || user.hrMaxBpm < 100) {
    return {
      ok: false,
      reason: "no_hr_profile",
      message:
        "Set your max HR in Settings to enable HR zones (e.g. 220 - age, or your highest observed value).",
    };
  }

  const whoopRestingHr = (await (prisma() as any).dailyWhoopStat.findFirst({
    where: { userId: args.userId, restingHeartRateBpm: { not: null } },
    orderBy: { date: "desc" },
    select: { restingHeartRateBpm: true },
  })) as { restingHeartRateBpm: number | null } | null;
  const hrRestUsed =
    typeof user.hrRestBpm === "number" && user.hrRestBpm > 0
      ? user.hrRestBpm
      : whoopRestingHr?.restingHeartRateBpm ?? null;

  const schemeKey = (user.hrZoneScheme as HrZoneSchemeKey) ?? "percent_max";
  const zoneEdgesBpm = computeZoneEdgesBpm({
    scheme: schemeKey,
    hrMaxBpm: user.hrMaxBpm,
    hrRestBpm: hrRestUsed,
    hrThresholdBpm: null,
  });

  const cached = await (prisma() as any).stravaActivityHrZones.findUnique({
    where: {
      userId_providerActivityId: {
        userId: args.userId,
        providerActivityId: args.providerActivityId,
      },
    },
  });
  if (
    cached &&
    cached.schemeKey === schemeKey &&
    cached.hrMaxBpm === user.hrMaxBpm &&
    (cached.hrRestBpm ?? null) === (hrRestUsed ?? null)
  ) {
    const dur = cached.zoneDurationsSec as Prisma.JsonValue;
    const edges = cached.zoneEdgesBpm as Prisma.JsonValue;
    if (Array.isArray(dur) && Array.isArray(edges)) {
      return {
        ok: true,
        cached: true,
        schemeKey,
        hrMaxBpm: user.hrMaxBpm,
        aggregate: {
          zoneDurationsSec: dur.map((n) => (typeof n === "number" ? n : 0)),
          zoneEdgesBpm: edges.map((n) => (typeof n === "number" ? n : 0)),
          totalSeconds: cached.totalSeconds,
          observedMaxBpm: cached.observedMaxBpm ?? 0,
        },
      };
    }
  }

  if (!args.accessToken) {
    return {
      ok: false,
      reason: "stream_error",
      message: "Connect Strava in Settings to compute HR zones from streams.",
    };
  }

  const url = new URL(
    `https://www.strava.com/api/v3/activities/${encodeURIComponent(args.providerActivityId)}/streams`,
  );
  url.searchParams.set("keys", "time,heartrate");

  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${args.accessToken}` },
  });
  if (!res.ok) {
    return {
      ok: false,
      reason: "stream_error",
      message: `Strava streams request failed (${res.status}).`,
    };
  }

  const parsed = parseStreamsPayload(await res.json().catch(() => null));
  if (!parsed) {
    return {
      ok: false,
      reason: "no_streams",
      message: "No HR stream available for this activity.",
    };
  }

  const aggregate = aggregateHrZones({
    timeSec: parsed.time,
    hrBpm: parsed.hr,
    zoneEdgesBpm,
  });
  if (aggregate.totalSeconds <= 0) {
    return {
      ok: false,
      reason: "no_streams",
      message: "HR stream contained no usable samples.",
    };
  }

  await (prisma() as any).stravaActivityHrZones.upsert({
    where: {
      userId_providerActivityId: {
        userId: args.userId,
        providerActivityId: args.providerActivityId,
      },
    },
    create: {
      userId: args.userId,
      providerActivityId: args.providerActivityId,
      schemeKey,
      hrMaxBpm: user.hrMaxBpm,
      hrRestBpm: hrRestUsed,
      zoneEdgesBpm: aggregate.zoneEdgesBpm,
      zoneDurationsSec: aggregate.zoneDurationsSec,
      totalSeconds: aggregate.totalSeconds,
      observedMaxBpm:
        Math.max(aggregate.observedMaxBpm, args.activityMaxHrBpm ?? 0) || null,
    },
    update: {
      schemeKey,
      hrMaxBpm: user.hrMaxBpm,
      hrRestBpm: hrRestUsed,
      zoneEdgesBpm: aggregate.zoneEdgesBpm,
      zoneDurationsSec: aggregate.zoneDurationsSec,
      totalSeconds: aggregate.totalSeconds,
      observedMaxBpm:
        Math.max(aggregate.observedMaxBpm, args.activityMaxHrBpm ?? 0) || null,
    },
  });

  return { ok: true, cached: false, schemeKey, hrMaxBpm: user.hrMaxBpm, aggregate };
}
