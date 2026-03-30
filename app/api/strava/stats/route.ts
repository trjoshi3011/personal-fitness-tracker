import { NextResponse } from "next/server";

import { getRecentStravaActivities, getStravaAthlete } from "@/lib/strava";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "30");
  const perPage = Number(url.searchParams.get("perPage") ?? "10");

  try {
    const [athlete, activities] = await Promise.all([
      getStravaAthlete(),
      getRecentStravaActivities({
        days: Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30,
        perPage:
          Number.isFinite(perPage) && perPage > 0 ? Math.min(perPage, 50) : 10,
      }),
    ]);

    if (!athlete || !activities) {
      return NextResponse.json(
        { ok: false, connected: false },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        connected: true,
        athlete: {
          id: athlete.id,
          firstname: athlete.firstname,
          lastname: athlete.lastname,
          city: athlete.city,
          state: athlete.state,
          country: athlete.country,
        },
        activities: activities.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          sportType: a.sport_type,
          startDate: a.start_date,
          distanceMeters: a.distance,
          movingTimeSec: a.moving_time,
          elevationGain: a.total_elevation_gain,
        })),
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: "STRAVA_STATS_FAILED", message },
      { status: 500 },
    );
  }
}

