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

    // Prefer the current request origin locally so a stale port in .env
    // (e.g. :3002 while the app is on :3000) cannot break the OAuth return.
    const origin = new URL(req.url).origin;
    const envRedirect = process.env.STRAVA_REDIRECT_URI;
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
      origin,
    );
    const redirectUri = isLocalhost
      ? `${origin}/api/strava/callback`
      : (envRedirect ?? `${origin}/api/strava/callback`);

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

