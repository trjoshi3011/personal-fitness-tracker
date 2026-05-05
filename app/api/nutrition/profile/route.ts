import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

const HeightUnit = z.enum(["cm", "in"]);
const Sex = z.enum(["MALE", "FEMALE", "OTHER"]);

const optionalNumber = z
  .preprocess(
    (v) => (v == null || v === "" ? null : Number(v)),
    z.union([z.number().positive(), z.null()]),
  )
  .optional();

const Schema = z.object({
  heightUnit: HeightUnit.default("cm"),
  height: optionalNumber,
  dateOfBirth: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
      z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]),
    )
    .optional(),
  biologicalSex: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
      z.union([Sex, z.null()]),
    )
    .optional(),
});

function redirect(req: Request, qs: string) {
  return NextResponse.redirect(new URL(`/nutrition?${qs}`, req.url), {
    status: 303,
  });
}

/**
 * Edits the user's body profile used for BMR. All fields optional — submitting
 * an empty value clears that field. Height is accepted in cm or inches and
 * normalized to cm.
 */
export async function POST(req: Request) {
  const userId = await requireUserId();
  const form = await req.formData();

  const parsed = Schema.safeParse({
    heightUnit: form.get("heightUnit") ?? "cm",
    height: form.get("height"),
    dateOfBirth: form.get("dateOfBirth"),
    biologicalSex: form.get("biologicalSex"),
  });
  if (!parsed.success) {
    const reason = encodeURIComponent(
      parsed.error.issues[0]?.message ?? "Invalid profile",
    );
    return redirect(req, `nutrition=error&reason=${reason}`);
  }

  const { heightUnit, height, dateOfBirth, biologicalSex } = parsed.data;
  const heightCm =
    height == null
      ? null
      : heightUnit === "in"
        ? height * 2.54
        : height;
  const dob =
    dateOfBirth == null
      ? null
      : new Date(`${dateOfBirth}T00:00:00Z`);
  if (dob && Number.isNaN(dob.getTime())) {
    return redirect(req, "nutrition=error&reason=invalid_date");
  }

  await prisma().user.update({
    where: { id: userId },
    data: {
      heightCm,
      dateOfBirth: dob,
      biologicalSex: biologicalSex ?? null,
    },
  });

  return redirect(req, "nutrition=profile_saved");
}
