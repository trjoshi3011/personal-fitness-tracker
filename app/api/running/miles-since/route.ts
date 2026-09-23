import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { sumRunDistanceMetersSince } from "@/lib/merged-runs";
import { metersToMiles } from "@/lib/units";
import { startOfZonedCalendarDay } from "@/lib/zoned-calendar";

function parseIsoDateOnly(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || y < 1970 || y > 2100) return null;
  if (!Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  if (!Number.isFinite(d) || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

export async function GET(req: Request) {
  const userId = await requireUserId();
  const url = new URL(req.url);
  const dateRaw = String(url.searchParams.get("date") ?? "").trim();

  const parsed = parseIsoDateOnly(dateRaw);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "INVALID_DATE" },
      { status: 400 },
    );
  }

  const user = await prisma().user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone?.trim() || "UTC";
  const startAt = startOfZonedCalendarDay(parsed.y, parsed.m, parsed.d, tz);

  const totalMeters = await sumRunDistanceMetersSince(userId, startAt);
  const miles = metersToMiles(totalMeters);

  return NextResponse.json({
    ok: true,
    date: dateRaw,
    totalMeters,
    miles: Number(miles.toFixed(2)),
  });
}

