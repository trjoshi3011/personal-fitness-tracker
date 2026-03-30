import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";

import { prisma } from "@/lib/db";

const SESSION_COOKIE = "pft_session";

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30d

  await prisma().session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  cookieStore.delete(SESSION_COOKIE);

  if (!token) return;
  const tokenHash = sha256Hex(token);
  await prisma().session.deleteMany({ where: { tokenHash } });
}

export async function getCurrentUserId() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = sha256Hex(token);
  const session = await prisma().session.findUnique({
    where: { tokenHash },
    select: { userId: true, expiresAt: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  return session.userId;
}

export async function requireUserId() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");
  return userId;
}

