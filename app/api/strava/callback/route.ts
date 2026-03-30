import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { exchangeStravaCodeForTokens } from "@/lib/strava";
import { syncStravaActivities } from "@/lib/strava-sync";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const scope = url.searchParams.get("scope");

  // If Strava sends the user back with an error, preserve it for visibility.
  if (error) {
    const dest = new URL("/settings", url.origin);
    dest.searchParams.set("strava", "error");
    dest.searchParams.set("reason", error);
    return NextResponse.redirect(dest);
  }

  if (!code) {
    return NextResponse.json(
      {
        ok: false,
        error: "STRAVA_CALLBACK_MISSING_CODE",
        message: "Missing `code` query parameter from Strava callback.",
      },
      { status: 400 },
    );
  }

  // Validate state cookie to prevent CSRF.
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("strava_oauth_state")?.value;
  cookieStore.delete("strava_oauth_state");

  if (!expectedState || !state || expectedState !== state) {
    return NextResponse.json(
      {
        ok: false,
        error: "STRAVA_CALLBACK_INVALID_STATE",
        message:
          "Invalid OAuth state. Please restart the connection from Settings.",
      },
      { status: 400 },
    );
  }

  try {
    const token = await exchangeStravaCodeForTokens(code);
    const athleteId = token.athlete?.id;
    if (!athleteId) {
      return NextResponse.json(
        {
          ok: false,
          error: "STRAVA_CALLBACK_MISSING_ATHLETE",
          message: "Strava token response missing `athlete.id`.",
        },
        { status: 502 },
      );
    }

    const userId = await requireUserId();
    const providerAccountId = String(athleteId);

    // Store in ConnectedAccount.
    //
    // Multi-user rule:
    // A single Strava athlete can only be linked to ONE dashboard user.
    const { connectedAccountId } = await prisma().$transaction(async (tx) => {
      const existingByAthlete = await tx.connectedAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "STRAVA",
            providerAccountId,
          },
        },
        select: { id: true, userId: true },
      });

      const data = {
        userId,
        provider: "STRAVA" as const,
        providerAccountId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenType: token.token_type,
        scope: token.scope ?? scope ?? null,
        expiresAt: new Date(token.expires_at * 1000),
        rawAuthPayload: token as unknown as object,
        isActive: true,
      };

      if (existingByAthlete && existingByAthlete.userId !== userId) {
        throw new Error(
          "This Strava account is already connected to another dashboard user. Please log into the original account or disconnect it there first.",
        );
      }

      const upserted = await tx.connectedAccount.upsert({
        where: { userId_provider: { userId, provider: "STRAVA" } },
        create: { ...data, lastSyncedAt: null },
        update: data,
        select: { id: true },
      });

      return { connectedAccountId: upserted.id };
    });

    // Populate the DB immediately so dashboard pages have data without requiring a manual sync.
    // Keep it small to avoid slow OAuth callback responses.
    try {
      await syncStravaActivities({
        userId,
        connectedAccountId,
        accessToken: token.access_token,
        days: 30,
      });
    } catch {
      // Non-fatal: user can sync manually from Settings.
    }

    const dest = new URL("/settings", url.origin);
    dest.searchParams.set("strava", "connected");
    return NextResponse.redirect(dest);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const dest = new URL("/settings", url.origin);
    dest.searchParams.set("strava", "error");
    dest.searchParams.set("reason", message);
    return NextResponse.redirect(dest);
  }
}

