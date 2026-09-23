import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getFitbitAuthorizeUrl } from "@/lib/fitbit";

export async function GET(req: Request) {
  try {
    const state = crypto.randomUUID();
    const cookieStore = await cookies();
    cookieStore.set("fitbit_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });

    const origin = new URL(req.url).origin;
    const envRedirect = process.env.FITBIT_REDIRECT_URI;
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
      origin,
    );
    const redirectUri = isLocalhost
      ? `${origin}/api/fitbit/callback`
      : (envRedirect ?? `${origin}/api/fitbit/callback`);

    const url = getFitbitAuthorizeUrl({ state, redirectUri });
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: "FITBIT_OAUTH_START_FAILED", message },
      { status: 500 },
    );
  }
}
