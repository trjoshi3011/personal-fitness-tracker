import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HR_ZONE_SCHEMES, type HrZoneSchemeKey } from "@/lib/hr-zones";

const HrProfileSchema = z.object({
  hrMaxBpm: z
    .preprocess(
      (v) => (v === "" || v == null ? null : Number(v)),
      z.union([z.number().int().min(120).max(230), z.null()]),
    )
    .optional(),
  hrRestBpm: z
    .preprocess(
      (v) => (v === "" || v == null ? null : Number(v)),
      z.union([z.number().int().min(30).max(110), z.null()]),
    )
    .optional(),
  hrZoneScheme: z
    .preprocess(
      (v) => (typeof v === "string" && v.length > 0 ? v : "percent_max"),
      z.string(),
    )
    .refine((v): v is HrZoneSchemeKey => v in HR_ZONE_SCHEMES, "Invalid scheme"),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  const form = await req.formData();
  const parsed = HrProfileSchema.safeParse({
    hrMaxBpm: form.get("hrMaxBpm"),
    hrRestBpm: form.get("hrRestBpm"),
    hrZoneScheme: form.get("hrZoneScheme") ?? "percent_max",
  });

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, req.url), { status: 303 });

  if (!parsed.success) {
    const reason = encodeURIComponent(
      parsed.error.issues[0]?.message ?? "Invalid HR profile input",
    );
    return redirectTo(`/settings?profile=error&reason=${reason}`);
  }

  const { hrMaxBpm = null, hrRestBpm = null, hrZoneScheme } = parsed.data;

  await prisma().user.update({
    where: { id: userId },
    data: {
      hrMaxBpm,
      hrRestBpm,
      hrZoneScheme,
    },
  });

  /**
   * Invalidate cached per-activity zones so they recompute against the new
   * profile next time the user opens a run.
   */
  await prisma().stravaActivityHrZones.deleteMany({ where: { userId } });

  return redirectTo("/settings?profile=ok");
}
