import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getValidStravaAccessTokenForUser } from "@/lib/strava";

type StravaZoneBucket = {
  min: number;
  max: number;
  time: number;
};

type StravaActivityZone = {
  type?: string;
  sensor_based?: boolean;
  points?: number;
  custom_zones?: boolean;
  distribution_buckets?: StravaZoneBucket[];
};

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
      select: { providerActivityId: true, rawPayload: true },
    });
    if (!activity) {
      return NextResponse.json(
        { ok: false, error: "Activity not found" },
        { status: 404 },
      );
    }

    const polyline = extractPolyline(activity.rawPayload);

    const accessToken = await getValidStravaAccessTokenForUser(userId);

    let zones: ZoneBlock[] = [];
    let zonesError: string | null = null;
    if (accessToken) {
      try {
        const res = await fetch(
          `https://www.strava.com/api/v3/activities/${encodeURIComponent(
            providerActivityId,
          )}/zones`,
          { headers: { authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as
            | StravaActivityZone[]
            | null;
          if (Array.isArray(data)) {
            zones = data.map((z) => ({
              type: (z.type ?? "unknown") as ZoneBlock["type"],
              sensorBased: Boolean(z.sensor_based),
              customZones: Boolean(z.custom_zones),
              buckets: Array.isArray(z.distribution_buckets)
                ? z.distribution_buckets.map((b) => ({
                    min: typeof b.min === "number" ? b.min : 0,
                    max: typeof b.max === "number" ? b.max : 0,
                    timeSec: typeof b.time === "number" ? b.time : 0,
                  }))
                : [],
            }));
          }
        } else if (res.status === 404) {
          zonesError = "Zone data not available for this run.";
        } else if (res.status === 401 || res.status === 403) {
          zonesError = "Strava authorization expired. Reconnect Strava in Settings.";
        } else {
          zonesError = `Strava zones request failed (${res.status}).`;
        }
      } catch {
        zonesError = "Could not load zone data from Strava.";
      }
    } else {
      zonesError = "Connect Strava in Settings to view zone data.";
    }

    return NextResponse.json({
      ok: true,
      polyline,
      zones,
      zonesError,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
