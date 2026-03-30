import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  next: z.string().optional(),
});

export async function POST(req: Request) {
  const form = await req.formData();
  const parsed = SignupSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    next: form.get("next") ?? undefined,
  });

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, req.url), { status: 303 });

  if (!parsed.success) {
    return redirectTo("/signup?error=Invalid%20input");
  }

  const { email, password, next } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma().user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existing) return redirectTo("/login?error=Account%20already%20exists");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma().user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      timezone: "UTC",
    },
    select: { id: true },
  });

  await createSession(user.id);
  return redirectTo(next && next.startsWith("/") ? next : "/overview");
}

