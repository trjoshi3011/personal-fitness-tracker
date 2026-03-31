import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

const ProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(40),
  lastName: z.string().trim().min(1).max(40),
  email: z.string().email(),
  timezone: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  const form = await req.formData();
  const parsed = ProfileSchema.safeParse({
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    email: form.get("email"),
    timezone: form.get("timezone"),
  });

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, req.url), { status: 303 });

  if (!parsed.success) {
    return redirectTo("/settings?profile=error&reason=Invalid%20profile%20input");
  }

  const { firstName, lastName, email, timezone } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existingEmailOwner = await prisma().user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existingEmailOwner && existingEmailOwner.id !== userId) {
    return redirectTo("/settings?profile=error&reason=Email%20already%20in%20use");
  }

  await prisma().user.update({
    where: { id: userId },
    data: {
      firstName,
      lastName,
      email: normalizedEmail,
      timezone,
    },
  });

  return redirectTo("/settings?profile=ok");
}
