import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { exchangeWhoopCodeForTokens } from "@/lib/whoop";
import { syncWhoopDailyStats } from "@/lib/whoop-sync";

async function fetchWhoopBasicProfile(accessToken: string) {
  const res = await fetch(
    "https://api.prod.whoop.com/developer/v2/user/profile/basic",
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  const json = (await res.json().catch(() => null)) as {
    user_id?: number;
  } | null;
  if (!res.ok || json?.user_id == null) {
    throw new Error("WHOOP profile request failed");
  }
  return json;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const scope = url.searchParams.get("scope");

  if (error) {
    const dest = new URL("/settings", url.origin);
    dest.searchParams.set("whoop", "error");
    dest.searchParams.set("reason", error);
    return NextResponse.redirect(dest);
  }

  if (!code) {
    return NextResponse.json(
      {
        ok: false,
        error: "WHOOP_CALLBACK_MISSING_CODE",
        message: "Missing `code` query parameter from WHOOP callback.",
      },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("whoop_oauth_state")?.value;
  cookieStore.delete("whoop_oauth_state");

  if (!expectedState || !state || expectedState !== state) {
    return NextResponse.json(
      {
        ok: false,
        error: "WHOOP_CALLBACK_INVALID_STATE",
        message:
          "Invalid OAuth state. Please restart the connection from Settings.",
      },
      { status: 400 },
    );
  }

  const origin = url.origin;
  const redirectUri =
    process.env.WHOOP_REDIRECT_URI ?? `${origin}/api/whoop/callback`;

  try {
    const token = await exchangeWhoopCodeForTokens(code, redirectUri);
    const profile = await fetchWhoopBasicProfile(token.access_token);
    const providerAccountId = String(profile.user_id);

    const expiresIn =
      typeof token.expires_in === "number" && token.expires_in > 0
        ? token.expires_in
        : 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const userId = await requireUserId();

    const { connectedAccountId } = await prisma().$transaction(async (tx) => {
      const existingByWhoopUser = await tx.connectedAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "WHOOP",
            providerAccountId,
          },
        },
        select: { id: true, userId: true },
      });

      const data = {
        userId,
        provider: "WHOOP" as const,
        providerAccountId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        tokenType: token.token_type,
        scope: token.scope ?? scope ?? null,
        expiresAt,
        rawAuthPayload: token as unknown as object,
        isActive: true,
      };

      if (existingByWhoopUser && existingByWhoopUser.userId !== userId) {
        throw new Error(
          "This WHOOP account is already connected to another dashboard user. Log into that account or disconnect WHOOP there first.",
        );
      }

      const upserted = await tx.connectedAccount.upsert({
        where: { userId_provider: { userId, provider: "WHOOP" } },
        create: { ...data, lastSyncedAt: null },
        update: data,
        select: { id: true },
      });

      return { connectedAccountId: upserted.id };
    });

    try {
      await syncWhoopDailyStats({
        userId,
        connectedAccountId,
        accessToken: token.access_token,
        days: 30,
      });
    } catch {
      // User can sync manually from Settings.
    }

    const dest = new URL("/settings", url.origin);
    dest.searchParams.set("whoop", "connected");
    return NextResponse.redirect(dest);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const dest = new URL("/settings", url.origin);
    dest.searchParams.set("whoop", "error");
    dest.searchParams.set("reason", message);
    return NextResponse.redirect(dest);
  }
}
