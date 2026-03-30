import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { exchangeFitbitCodeForTokens } from "@/lib/fitbit";
import { syncFitbitDailyStats } from "@/lib/fitbit-sync";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const scope = url.searchParams.get("scope");

  if (error) {
    const dest = new URL("/settings", url.origin);
    dest.searchParams.set("fitbit", "error");
    dest.searchParams.set("reason", error);
    return NextResponse.redirect(dest);
  }

  if (!code) {
    return NextResponse.json(
      {
        ok: false,
        error: "FITBIT_CALLBACK_MISSING_CODE",
        message: "Missing `code` query parameter from Fitbit callback.",
      },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("fitbit_oauth_state")?.value;
  cookieStore.delete("fitbit_oauth_state");

  if (!expectedState || !state || expectedState !== state) {
    return NextResponse.json(
      {
        ok: false,
        error: "FITBIT_CALLBACK_INVALID_STATE",
        message:
          "Invalid OAuth state. Please restart the connection from Settings.",
      },
      { status: 400 },
    );
  }

  const origin = url.origin;
  const redirectUri =
    process.env.FITBIT_REDIRECT_URI ?? `${origin}/api/fitbit/callback`;

  try {
    const token = await exchangeFitbitCodeForTokens(code, redirectUri);
    const providerAccountId = token.user_id;
    if (!providerAccountId) {
      return NextResponse.json(
        {
          ok: false,
          error: "FITBIT_CALLBACK_MISSING_USER",
          message: "Fitbit token response missing `user_id`.",
        },
        { status: 502 },
      );
    }

    const userId = await requireUserId();

    const { connectedAccountId } = await prisma().$transaction(async (tx) => {
      const existingByFitbitUser = await tx.connectedAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "FITBIT",
            providerAccountId,
          },
        },
        select: { id: true, userId: true },
      });

      const expiresAt = new Date(Date.now() + token.expires_in * 1000);

      const data = {
        userId,
        provider: "FITBIT" as const,
        providerAccountId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenType: token.token_type,
        scope: token.scope ?? scope ?? null,
        expiresAt,
        rawAuthPayload: token as unknown as object,
        isActive: true,
      };

      if (existingByFitbitUser && existingByFitbitUser.userId !== userId) {
        throw new Error(
          "This Fitbit account is already connected to another dashboard user. Log into that account or disconnect Fitbit there first.",
        );
      }

      const upserted = await tx.connectedAccount.upsert({
        where: { userId_provider: { userId, provider: "FITBIT" } },
        create: { ...data, lastSyncedAt: null },
        update: data,
        select: { id: true },
      });

      return { connectedAccountId: upserted.id };
    });

    try {
      await syncFitbitDailyStats({
        userId,
        connectedAccountId,
        accessToken: token.access_token,
        days: 30,
      });
    } catch {
      // User can sync manually from Settings.
    }

    const dest = new URL("/settings", url.origin);
    dest.searchParams.set("fitbit", "connected");
    return NextResponse.redirect(dest);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const dest = new URL("/settings", url.origin);
    dest.searchParams.set("fitbit", "error");
    dest.searchParams.set("reason", message);
    return NextResponse.redirect(dest);
  }
}
