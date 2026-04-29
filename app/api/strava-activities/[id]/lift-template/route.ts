import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { isLiftSessionTemplate } from "@/lib/lift-session-log";
import { isStravaLift } from "@/lib/merged-lifts";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await ctx.params;

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || !("template" in body)) {
      return NextResponse.json(
        { ok: false, error: "Missing template (or null to clear)" },
        { status: 400 },
      );
    }

    const raw = body.template;
    const template =
      raw === null || raw === ""
        ? null
        : typeof raw === "string" && isLiftSessionTemplate(raw)
          ? raw
          : null;

    if (raw !== null && raw !== "" && template === null) {
      return NextResponse.json({ ok: false, error: "Invalid template" }, { status: 400 });
    }

    const activity = await prisma().stravaActivity.findFirst({
      where: { id, userId },
      select: { id: true, type: true, sportType: true },
    });

    if (!activity) {
      return NextResponse.json({ ok: false, error: "Activity not found" }, { status: 404 });
    }
    if (!isStravaLift(activity)) {
      return NextResponse.json(
        { ok: false, error: "Activity is not a WeightTraining session" },
        { status: 400 },
      );
    }

    await prisma().stravaActivity.update({
      where: { id },
      data: { liftSessionTemplate: template },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
