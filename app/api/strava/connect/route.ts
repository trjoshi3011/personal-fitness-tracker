import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getStravaAuthorizeUrl } from "@/lib/strava";

export async function GET(req: Request) {
  try {
    // OAuth CSRF protection: generate and store state in an HttpOnly cookie.
    const state = crypto.randomUUID();
    const cookieStore = await cookies();
    cookieStore.set("strava_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60, // 10 minutes
    });

    // Prefer env override, otherwise derive from current origin (helps when dev port changes).
    const origin = new URL(req.url).origin;
    const redirectUri =
      process.env.STRAVA_REDIRECT_URI ?? `${origin}/api/strava/callback`;

    const url = getStravaAuthorizeUrl({ state, redirectUri });
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: "STRAVA_OAUTH_START_FAILED", message },
      { status: 500 },
    );
  }
}

