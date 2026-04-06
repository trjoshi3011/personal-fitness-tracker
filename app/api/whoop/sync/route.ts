import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getValidWhoopAccessToken } from "@/lib/whoop";
import { syncWhoopDailyStatsWithLog } from "@/lib/whoop-sync";
import { MAX_WHOOP_SYNC_DAYS } from "@/lib/sync-constants";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "90");
  const daysClamped =
    Number.isFinite(days) && days > 0 ? Math.min(days, MAX_WHOOP_SYNC_DAYS) : 90;
  const accept = req.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html");

  const redirectToSettings = (params: Record<string, string>) => {
    const dest = new URL("/settings", url.origin);
    for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, v);
    return NextResponse.redirect(dest, { status: 303 });
  };

  const userId = await requireUserId();

  const account = await prisma().connectedAccount.findUnique({
    where: { userId_provider: { userId, provider: "WHOOP" } },
    select: { id: true, isActive: true },
  });

  if (!account || !account.isActive) {
    if (wantsHtml) return redirectToSettings({ whoopSync: "not_connected" });
    return NextResponse.json(
      { ok: false, error: "WHOOP_NOT_CONNECTED" },
      { status: 400 },
    );
  }

  const result = await syncWhoopDailyStatsWithLog({
    userId,
    connectedAccountId: account.id,
    days: daysClamped,
    getAccessToken: () => getValidWhoopAccessToken(),
  });

  if (!result.ok) {
    if (wantsHtml) return redirectToSettings({ whoopSync: "error" });
    return NextResponse.json(
      { ok: false, error: "WHOOP_SYNC_FAILED", message: result.error },
      { status: 500 },
    );
  }

  if (wantsHtml) {
    return redirectToSettings({
      whoopSync: "ok",
      fetched: String(result.fetched),
      upserted: String(result.upserted),
      workoutsUpserted: String(result.workoutsUpserted),
    });
  }

  return NextResponse.json({
    ok: true,
    fetched: result.fetched,
    upserted: result.upserted,
    days: result.days,
    workoutsFetched: result.workoutsFetched,
    workoutsUpserted: result.workoutsUpserted,
  });
}
