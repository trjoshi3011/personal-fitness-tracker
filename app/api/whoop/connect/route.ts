import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getWhoopAuthorizeUrl } from "@/lib/whoop";

export async function GET(req: Request) {
  try {
    const state = crypto.randomUUID();
    const cookieStore = await cookies();
    cookieStore.set("whoop_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });

    const origin = new URL(req.url).origin;
    const redirectUri =
      process.env.WHOOP_REDIRECT_URI ?? `${origin}/api/whoop/callback`;

    const url = getWhoopAuthorizeUrl({ state, redirectUri });
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: "WHOOP_OAUTH_START_FAILED", message },
      { status: 500 },
    );
  }
}
