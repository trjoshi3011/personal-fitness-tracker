import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { normalizeUserTimezone } from "@/lib/user-timezone";
import { parseIsoDateOnlyInTz } from "@/lib/zoned-calendar";

/**
 * Numeric form value coercion: empty string / undefined → null (so users can
 * skip optional macro fields), otherwise must be a finite non-negative number.
 */
const optionalNumber = z
  .preprocess(
    (v) => (v == null || v === "" ? null : Number(v)),
    z.union([z.number().nonnegative().max(20000), z.null()]),
  )
  .optional();

const UpsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  caloriesKcal: optionalNumber,
  proteinG: optionalNumber,
  carbsG: optionalNumber,
  fatG: optionalNumber,
  fiberG: optionalNumber,
  sugarG: optionalNumber,
  sodiumMg: optionalNumber,
  saturatedFatG: optionalNumber,
  notes: z
    .preprocess(
      (v) => (typeof v === "string" ? v.trim() : ""),
      z.string().max(280),
    )
    .optional(),
});

const DeleteSchema = z.object({
  id: z.string().min(1),
});

function redirect(req: Request, qs: string) {
  return NextResponse.redirect(new URL(`/nutrition?${qs}`, req.url), {
    status: 303,
  });
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  const form = await req.formData();
  const action = String(form.get("_action") ?? "upsert");

  if (action === "delete") {
    const parsed = DeleteSchema.safeParse({ id: form.get("id") });
    if (!parsed.success) {
      return redirect(req, "nutrition=error&reason=invalid_id");
    }
    await prisma().dailyNutritionLog.deleteMany({
      where: { id: parsed.data.id, userId, source: "MANUAL" },
    });
    return redirect(req, "nutrition=deleted");
  }

  const parsed = UpsertSchema.safeParse({
    date: form.get("date"),
    caloriesKcal: form.get("caloriesKcal"),
    proteinG: form.get("proteinG"),
    carbsG: form.get("carbsG"),
    fatG: form.get("fatG"),
    fiberG: form.get("fiberG"),
    sugarG: form.get("sugarG"),
    sodiumMg: form.get("sodiumMg"),
    saturatedFatG: form.get("saturatedFatG"),
    notes: form.get("notes") ?? "",
  });
  if (!parsed.success) {
    const reason = encodeURIComponent(
      parsed.error.issues[0]?.message ?? "Invalid nutrition entry",
    );
    return redirect(req, `nutrition=error&reason=${reason}`);
  }

  const userRow = await prisma().user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = normalizeUserTimezone(userRow?.timezone);

  const dateOk = parseIsoDateOnlyInTz(parsed.data.date, tz);
  if (dateOk == null) {
    return redirect(req, "nutrition=error&reason=invalid_date");
  }

  const data = parsed.data;
  // Reject totally-empty submissions — a row with all-null macros has nothing
  // to surface in the UI and would just clutter the recent-entries list.
  const hasAnyValue = [
    data.caloriesKcal,
    data.proteinG,
    data.carbsG,
    data.fatG,
    data.fiberG,
    data.sugarG,
    data.sodiumMg,
    data.saturatedFatG,
  ].some((v) => v != null && v > 0);
  if (!hasAnyValue) {
    return redirect(req, "nutrition=error&reason=no_values");
  }

  await prisma().dailyNutritionLog.upsert({
    where: {
      userId_date_source: {
        userId,
        date: dateOk.date,
        source: "MANUAL",
      },
    },
    create: {
      userId,
      date: dateOk.date,
      source: "MANUAL",
      caloriesKcal: data.caloriesKcal ?? null,
      proteinG: data.proteinG ?? null,
      carbsG: data.carbsG ?? null,
      fatG: data.fatG ?? null,
      fiberG: data.fiberG ?? null,
      sugarG: data.sugarG ?? null,
      sodiumMg: data.sodiumMg ?? null,
      saturatedFatG: data.saturatedFatG ?? null,
      notes: data.notes || null,
    },
    update: {
      caloriesKcal: data.caloriesKcal ?? null,
      proteinG: data.proteinG ?? null,
      carbsG: data.carbsG ?? null,
      fatG: data.fatG ?? null,
      fiberG: data.fiberG ?? null,
      sugarG: data.sugarG ?? null,
      sodiumMg: data.sodiumMg ?? null,
      saturatedFatG: data.saturatedFatG ?? null,
      notes: data.notes || null,
    },
  });

  return redirect(req, "nutrition=saved");
}
