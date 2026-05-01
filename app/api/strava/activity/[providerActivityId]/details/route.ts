import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getValidStravaAccessTokenForUser } from "@/lib/strava";
import { fetchOrComputeActivityHrZones, HR_ZONE_SCHEMES } from "@/lib/hr-zones";

type ZoneBucket = {
  min: number;
  max: number;
  timeSec: number;
};

type ZoneBlock = {
  type: "heartrate" | "pace" | "power" | string;
  sensorBased: boolean;
  customZones: boolean;
  buckets: ZoneBucket[];
};

function extractPolyline(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const map = (rawPayload as { map?: unknown }).map;
  if (!map || typeof map !== "object") return null;
  const m = map as { summary_polyline?: unknown; polyline?: unknown };
  if (typeof m.polyline === "string" && m.polyline.length > 0) return m.polyline;
  if (typeof m.summary_polyline === "string" && m.summary_polyline.length > 0) {
    return m.summary_polyline;
  }
  return null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ providerActivityId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { providerActivityId } = await ctx.params;

    const activity = await prisma().stravaActivity.findUnique({
      where: {
        userId_providerActivityId: { userId, providerActivityId },
      },
      select: { providerActivityId: true, rawPayload: true, maxHrBpm: true },
    });
    if (!activity) {
      return NextResponse.json(
        { ok: false, error: "Activity not found" },
        { status: 404 },
      );
    }

    const polyline = extractPolyline(activity.rawPayload);
    const accessToken = await getValidStravaAccessTokenForUser(userId);

    /**
     * We compute zones ourselves from the HR stream against the user's HR profile
     * (max HR + scheme). Strava's /zones is Summit-only and returns 402 for many
     * athletes, so we don't depend on it.
     */
    const result = await fetchOrComputeActivityHrZones({
      userId,
      providerActivityId,
      accessToken,
      activityMaxHrBpm: activity.maxHrBpm,
    });

    let zones: ZoneBlock[] = [];
    let zonesError: string | null = null;
    let zonesHint: string | null = null;
    if (result.ok) {
      const edges = result.aggregate.zoneEdgesBpm;
      const durs = result.aggregate.zoneDurationsSec;
      const buckets: ZoneBucket[] = durs.map((sec, i) => ({
        min: edges[i] ?? 0,
        max: edges[i + 1] ?? edges[i] ?? 0,
        timeSec: sec,
      }));
      zones = [
        {
          type: "heartrate",
          sensorBased: true,
          customZones: false,
          buckets,
        },
      ];
      const scheme = HR_ZONE_SCHEMES[result.schemeKey];
      zonesHint = `Computed from your HR stream against ${result.hrMaxBpm} bpm max (${scheme?.description ?? "your scheme"})${result.cached ? " — cached" : ""}.`;
    } else {
      zonesError = result.message;
    }

    return NextResponse.json({
      ok: true,
      polyline,
      zones,
      zonesError,
      zonesHint,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
