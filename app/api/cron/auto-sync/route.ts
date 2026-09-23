import { NextResponse } from "next/server";

import { runAutoSyncForDueUsers } from "@/lib/auto-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cron entrypoint. Expected to be hit on a ~30 minute cadence by Vercel Cron
 * (see `vercel.json`) or any external scheduler. Triggers Strava + WHOOP sync
 * once per user per local day, at the end of their day (hour 23 in their tz).
 *
 * Auth: requires `CRON_SECRET` env var. Vercel Cron sends it automatically as
 * `Authorization: Bearer <CRON_SECRET>`. For manual / external use, send the
 * same header.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  if (header !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const result = await runAutoSyncForDueUsers();

  return NextResponse.json({
    ok: true,
    ranAt: result.ranAt,
    triggeredCount: result.triggered.length,
    triggered: result.triggered,
  });
}
