import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

type FitbitTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  user_id: string;
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

function fitbitBasicAuthHeader() {
  const clientId = requiredEnv("FITBIT_CLIENT_ID");
  const clientSecret = sanitizeEnvSecret("FITBIT_CLIENT_SECRET");
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );
  return `Basic ${credentials}`;
}

export function getFitbitAuthorizeUrl({
  state,
  redirectUri,
}: {
  state: string;
  redirectUri: string;
}) {
  const clientId = requiredEnv("FITBIT_CLIENT_ID");
  const scope =
    process.env.FITBIT_SCOPES ??
    "activity heartrate sleep profile weight";

  const url = new URL("https://www.fitbit.com/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeFitbitCodeForTokens(
  code: string,
  redirectUri: string,
) {
  const clientId = requiredEnv("FITBIT_CLIENT_ID");

  const body = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: fitbitBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const json = (await res.json().catch(() => null)) as FitbitTokenResponse | null;
  if (!res.ok || !json?.access_token) {
    const message =
      typeof (json as any)?.errors?.[0]?.message === "string"
        ? (json as any).errors[0].message
        : typeof (json as any)?.error_description === "string"
          ? (json as any).error_description
          : `Fitbit token exchange failed (${res.status})`;
    throw new Error(message);
  }

  return json;
}

export async function refreshFitbitTokens(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: fitbitBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const json = (await res.json().catch(() => null)) as FitbitTokenResponse | null;
  if (!res.ok || !json?.access_token) {
    const message =
      typeof (json as any)?.errors?.[0]?.message === "string"
        ? (json as any).errors[0].message
        : typeof (json as any)?.error_description === "string"
          ? (json as any).error_description
          : `Fitbit token refresh failed (${res.status})`;
    throw new Error(message);
  }

  return json;
}

/**
 * Valid access token for a user; refreshes and persists when near expiry.
 */
export async function getValidFitbitAccessTokenForUser(userId: string) {
  const account = await prisma().connectedAccount.findUnique({
    where: { userId_provider: { userId, provider: "FITBIT" } },
  });

  if (!account || !account.isActive) return null;

  if (!account.expiresAt) return account.accessToken;

  const now = Date.now();
  const expiresAtMs = account.expiresAt.getTime();
  const needsRefresh = expiresAtMs - now < 60_000;
  if (!needsRefresh) return account.accessToken;

  if (!account.refreshToken) {
    throw new Error("Fitbit refreshToken missing; reconnect Fitbit.");
  }

  const refreshed = await refreshFitbitTokens(account.refreshToken);

  const providerAccountId = refreshed.user_id ?? account.providerAccountId;
  if (!providerAccountId) {
    throw new Error("Fitbit refresh response missing user_id");
  }

  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  const updated = await prisma().connectedAccount.update({
    where: { id: account.id },
    data: {
      providerAccountId: String(providerAccountId),
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenType: refreshed.token_type,
      scope: refreshed.scope ?? account.scope,
      expiresAt,
      rawAuthPayload: refreshed as unknown as object,
      updatedAt: new Date(),
    },
  });

  return updated.accessToken;
}

export async function getValidFitbitAccessToken() {
  const userId = await requireUserId();
  return getValidFitbitAccessTokenForUser(userId);
}
