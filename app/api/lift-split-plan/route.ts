import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

function clampInt(n: unknown, max = 14): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  const x = Math.round(n);
  if (x < 0) return 0;
  if (x > max) return max;
  return x;
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const row = await prisma().liftSplitWeeklyTarget.findUnique({
      where: { userId },
    });
    return NextResponse.json({
      ok: true,
      targets: row
        ? {
            pushTarget: row.pushTarget,
            pullTarget: row.pullTarget,
            legsTarget: row.legsTarget,
          }
        : {
            pushTarget: 0,
            pullTarget: 0,
            legsTarget: 0,
          },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const pushTarget = clampInt(body.pushTarget);
    const pullTarget = clampInt(body.pullTarget);
    const legsTarget = clampInt(body.legsTarget);

    await prisma().liftSplitWeeklyTarget.upsert({
      where: { userId },
      create: {
        userId,
        pushTarget,
        pullTarget,
        legsTarget,
      },
      update: {
        pushTarget,
        pullTarget,
        legsTarget,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
