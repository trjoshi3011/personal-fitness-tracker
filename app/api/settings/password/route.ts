import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

const PasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(8),
});

export async function POST(req: Request) {
  const userId = await requireUserId();
  const form = await req.formData();
  const parsed = PasswordSchema.safeParse({
    currentPassword: form.get("currentPassword"),
    newPassword: form.get("newPassword"),
    confirmPassword: form.get("confirmPassword"),
  });

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, req.url), { status: 303 });

  if (!parsed.success) {
    return redirectTo("/settings?password=error&reason=Invalid%20password%20input");
  }

  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) {
    return redirectTo("/settings?password=error&reason=Passwords%20do%20not%20match");
  }

  const user = await prisma().user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) {
    return redirectTo("/settings?password=error&reason=User%20not%20found");
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return redirectTo("/settings?password=error&reason=Current%20password%20is%20incorrect");
  }

  const nextHash = await bcrypt.hash(newPassword, 12);
  await prisma().user.update({
    where: { id: userId },
    data: { passwordHash: nextHash },
  });

  await prisma().session.deleteMany({ where: { userId } });

  return redirectTo("/login?password=updated");
}
