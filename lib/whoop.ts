import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

const WHOOP_AUTH = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";

type WhoopTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
} & Record<string, unknown>;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function sanitizeEnvSecret(name: string) {
  const raw = requiredEnv(name);
  const value = raw.trim();
  if (value.includes("\n")) {
    throw new Error(`${name} contains a newline. Ensure it is on one line.`);
  }
  return value;
}

export function getWhoopAuthorizeUrl({
  state,
  redirectUri,
}: {
  state: string;
  redirectUri: string;
}) {
  const clientId = requiredEnv("WHOOP_CLIENT_ID");
  const scope =
    process.env.WHOOP_SCOPES ??
    "offline read:profile read:recovery read:cycles read:sleep read:body_measurement read:workout";

  const url = new URL(WHOOP_AUTH);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  return url.toString();
}

async function postWhoopToken(body: Record<string, string>) {
  const res = await fetch(WHOOP_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => null)) as unknown;
  const token = json as WhoopTokenResponse | null;
  if (!res.ok || !token?.access_token) {
    const err = json as { error_description?: string; error?: string } | null;
    const message =
      typeof err?.error_description === "string"
        ? err.error_description
        : typeof err?.error === "string"
          ? err.error
          : `WHOOP token request failed (${res.status})`;
    throw new Error(message);
  }
  return token;
}

export async function exchangeWhoopCodeForTokens(
  code: string,
  redirectUri: string,
) {
  const clientId = requiredEnv("WHOOP_CLIENT_ID");
  const clientSecret = sanitizeEnvSecret("WHOOP_CLIENT_SECRET");
  return postWhoopToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

export async function refreshWhoopTokens(refreshToken: string) {
  const clientId = requiredEnv("WHOOP_CLIENT_ID");
  const clientSecret = sanitizeEnvSecret("WHOOP_CLIENT_SECRET");
  return postWhoopToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: "offline",
  });
}

export async function getValidWhoopAccessTokenForUser(userId: string) {
  const account = await prisma().connectedAccount.findUnique({
    where: { userId_provider: { userId, provider: "WHOOP" } },
  });

  if (!account || !account.isActive) return null;

  if (!account.expiresAt) return account.accessToken;

  const now = Date.now();
  const expiresAtMs = account.expiresAt.getTime();
  const needsRefresh = expiresAtMs - now < 60_000;
  if (!needsRefresh) return account.accessToken;

  if (!account.refreshToken) {
    throw new Error("WHOOP refreshToken missing; reconnect WHOOP.");
  }

  const refreshed = await refreshWhoopTokens(account.refreshToken);

  const expiresIn =
    typeof refreshed.expires_in === "number" && refreshed.expires_in > 0
      ? refreshed.expires_in
      : 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const updated = await prisma().connectedAccount.update({
    where: { id: account.id },
    data: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? account.refreshToken,
      tokenType: refreshed.token_type,
      scope: refreshed.scope ?? account.scope,
      expiresAt,
      rawAuthPayload: refreshed as unknown as object,
      updatedAt: new Date(),
    },
  });

  return updated.accessToken;
}

export async function getValidWhoopAccessToken() {
  const userId = await requireUserId();
  return getValidWhoopAccessTokenForUser(userId);
}
