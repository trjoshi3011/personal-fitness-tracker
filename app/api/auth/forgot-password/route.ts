import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
});

export async function POST(req: Request) {
  const form = await req.formData();
  const parsed = ForgotPasswordSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    confirmPassword: form.get("confirmPassword"),
  });

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, req.url), { status: 303 });

  if (!parsed.success) {
    return redirectTo("/login?forgot=error&reason=Invalid%20input");
  }

  const { email, password, confirmPassword } = parsed.data;
  if (password !== confirmPassword) {
    return redirectTo("/login?forgot=error&reason=Passwords%20do%20not%20match");
  }

  const normalizedEmail = email.toLowerCase();
  const user = await prisma().user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  // Keep response generic so we do not reveal account existence.
  if (!user) {
    return redirectTo(
      "/login?forgot=ok&reason=If%20an%20account%20exists%2C%20its%20password%20was%20updated",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma().user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  await prisma().session.deleteMany({ where: { userId: user.id } });

  return redirectTo("/login?forgot=ok&reason=Password%20updated.%20Please%20log%20in");
}
