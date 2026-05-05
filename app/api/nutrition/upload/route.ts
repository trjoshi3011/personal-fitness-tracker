import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseAppleHealthDietary } from "@/lib/apple-health-import";
import { normalizeUserTimezone } from "@/lib/user-timezone";
import { parseIsoDateOnlyInTz } from "@/lib/zoned-calendar";

/**
 * Apple Health export.xml uploads are huge (often 200MB+) and we stream-parse
 * them with sax. Force the Node.js runtime so we get streaming `Request` body
 * + filesystem semantics; the edge runtime would buffer the whole thing.
 */
export const runtime = "nodejs";
/** Treat as fully dynamic so Next never tries to cache the upload. */
export const dynamic = "force-dynamic";
/** Allow long-running parses (default 10s on Vercel hobby). */
export const maxDuration = 300;

const ACCEPTED_MIME = new Set([
  "application/xml",
  "text/xml",
  "application/octet-stream",
  "",
]);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return jsonError(401, "Unauthenticated");
  }

  const userRow = await prisma().user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = normalizeUserTimezone(userRow?.timezone);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    return jsonError(400, "Could not read uploaded form data", {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError(400, "Missing `file` field (Apple Health export.xml)");
  }

  // Apple Health zips often have export.xml inside; the user is expected to
  // unzip and upload export.xml directly. Reject `.zip` so we surface a clear
  // error instead of "Could not parse XML".
  if (file.name.toLowerCase().endsWith(".zip")) {
    return jsonError(
      415,
      "Please unzip Apple's export and upload export.xml directly (not the .zip).",
    );
  }
  if (!ACCEPTED_MIME.has(file.type) && !file.name.toLowerCase().endsWith(".xml")) {
    return jsonError(415, `Unsupported file type: ${file.type || "unknown"}`);
  }

  let parsed: Awaited<ReturnType<typeof parseAppleHealthDietary>>;
  try {
    parsed = await parseAppleHealthDietary(file.stream());
  } catch (err) {
    return jsonError(400, "Failed to parse Apple Health XML", {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  /**
   * Auto-seed profile fields (height / DOB / biological sex) from the export.
   * We only fill **null** fields — we never overwrite anything the user has
   * already entered manually. Done before the (potentially long) day loop so
   * the BMR formula on the next page render has what it needs.
   */
  const existingProfile = await prisma().user.findUnique({
    where: { id: userId },
    select: { heightCm: true, dateOfBirth: true, biologicalSex: true },
  });
  const profileUpdates: {
    heightCm?: number;
    dateOfBirth?: Date;
    biologicalSex?: string;
  } = {};
  if (existingProfile?.heightCm == null && parsed.profile.heightCm != null) {
    profileUpdates.heightCm = parsed.profile.heightCm;
  }
  if (existingProfile?.dateOfBirth == null && parsed.profile.dateOfBirth) {
    const dob = new Date(`${parsed.profile.dateOfBirth}T00:00:00Z`);
    if (!Number.isNaN(dob.getTime())) profileUpdates.dateOfBirth = dob;
  }
  if (
    existingProfile?.biologicalSex == null &&
    parsed.profile.biologicalSex != null
  ) {
    profileUpdates.biologicalSex = parsed.profile.biologicalSex;
  }
  if (Object.keys(profileUpdates).length > 0) {
    await prisma().user.update({ where: { id: userId }, data: profileUpdates });
  }

  if (parsed.days.size === 0) {
    return NextResponse.json({
      ok: true,
      daysImported: 0,
      profileUpdated: Object.keys(profileUpdates).length > 0,
      message:
        "No dietary or active-energy records found. Make sure the device that logs your meals + workouts (e.g. iPhone, Apple Watch, MyFitnessPal) is sharing with Apple Health.",
    });
  }

  /**
   * Upsert each parsed day as a BACKFILL row. Overwrites prior BACKFILL rows
   * (re-imports are idempotent). MANUAL rows on the same day stay untouched;
   * chart merges prefer MANUAL over BACKFILL.
   */
  let upserts = 0;
  let oldestDay: string | null = null;
  let newestDay: string | null = null;
  for (const day of parsed.days.values()) {
    const dateOk = parseIsoDateOnlyInTz(day.dayKey, tz);
    if (dateOk == null) continue;

    if (oldestDay == null || day.dayKey < oldestDay) oldestDay = day.dayKey;
    if (newestDay == null || day.dayKey > newestDay) newestDay = day.dayKey;

    await prisma().dailyNutritionLog.upsert({
      where: {
        userId_date_source: {
          userId,
          date: dateOk.date,
          source: "BACKFILL",
        },
      },
      create: {
        userId,
        date: dateOk.date,
        source: "BACKFILL",
        caloriesKcal: day.caloriesKcal || null,
        proteinG: day.proteinG || null,
        carbsG: day.carbsG || null,
        fatG: day.fatG || null,
        fiberG: day.fiberG || null,
        sugarG: day.sugarG || null,
        sodiumMg: day.sodiumMg || null,
        saturatedFatG: day.saturatedFatG || null,
        activeEnergyKcal: day.activeEnergyKcal || null,
      },
      update: {
        caloriesKcal: day.caloriesKcal || null,
        proteinG: day.proteinG || null,
        carbsG: day.carbsG || null,
        fatG: day.fatG || null,
        fiberG: day.fiberG || null,
        sugarG: day.sugarG || null,
        sodiumMg: day.sodiumMg || null,
        saturatedFatG: day.saturatedFatG || null,
        activeEnergyKcal: day.activeEnergyKcal || null,
      },
    });
    upserts += 1;
  }

  return NextResponse.json({
    ok: true,
    daysImported: upserts,
    rangeStart: oldestDay,
    rangeEnd: newestDay,
    profileUpdated: Object.keys(profileUpdates).length > 0,
    profile: parsed.profile,
  });
}
