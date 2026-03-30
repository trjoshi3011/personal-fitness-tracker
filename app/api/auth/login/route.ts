import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { getValidStravaAccessTokenForUser } from "@/lib/strava";
import { syncStravaActivitiesWithLog } from "@/lib/strava-sync";
import { getValidFitbitAccessTokenForUser } from "@/lib/fitbit";
import { syncFitbitDailyStatsWithLog } from "@/lib/fitbit-sync";
import { getValidWhoopAccessTokenForUser } from "@/lib/whoop";
import { syncWhoopDailyStatsWithLog } from "@/lib/whoop-sync";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function POST(req: Request) {
  const form = await req.formData();
  const parsed = LoginSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    next: form.get("next") ?? undefined,
  });

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, req.url), { status: 303 });

  if (!parsed.success) {
    return redirectTo("/login?error=Invalid%20credentials");
  }

  const { email, password, next } = parsed.data;

  const user = await prisma().user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, passwordHash: true },
  });

  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!ok || !user) {
    return redirectTo("/login?error=Invalid%20email%20or%20password");
  }

  await createSession(user.id);

  const stravaAccount = await prisma().connectedAccount.findUnique({
    where: { userId_provider: { userId: user.id, provider: "STRAVA" } },
    select: { id: true, isActive: true },
  });

  if (stravaAccount?.isActive) {
    await syncStravaActivitiesWithLog({
      userId: user.id,
      connectedAccountId: stravaAccount.id,
      days: 90,
      getAccessToken: () => getValidStravaAccessTokenForUser(user.id),
    });
  }

  const fitbitAccount = await prisma().connectedAccount.findUnique({
    where: { userId_provider: { userId: user.id, provider: "FITBIT" } },
    select: { id: true, isActive: true },
  });

  if (fitbitAccount?.isActive) {
    await syncFitbitDailyStatsWithLog({
      userId: user.id,
      connectedAccountId: fitbitAccount.id,
      days: 90,
      getAccessToken: () => getValidFitbitAccessTokenForUser(user.id),
    });
  }

  const whoopAccount = await prisma().connectedAccount.findUnique({
    where: { userId_provider: { userId: user.id, provider: "WHOOP" } },
    select: { id: true, isActive: true },
  });

  if (whoopAccount?.isActive) {
    await syncWhoopDailyStatsWithLog({
      userId: user.id,
      connectedAccountId: whoopAccount.id,
      days: 90,
      getAccessToken: () => getValidWhoopAccessTokenForUser(user.id),
    });
  }

  return redirectTo(next && next.startsWith("/") ? next : "/overview");
}

