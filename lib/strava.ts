import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

type StravaTokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  expires_in: number;
  athlete?: { id: number } & Record<string, unknown>;
  scope?: string;
} & Record<string, unknown>;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function sanitizeEnvSecret(name: string) {
  const raw = requiredEnv(name);
  // Guard against accidental newlines when copying secrets.
  const value = raw.trim();
  if (value.includes("\n")) {
    throw new Error(`${name} contains a newline. Ensure it is on one line.`);
  }
  return value;
}

export function getStravaAuthorizeUrl({
  state,
  redirectUri,
}: {
  state: string;
  redirectUri: string;
}) {
  const clientId = requiredEnv("STRAVA_CLIENT_ID");
  const scope =
    process.env.STRAVA_SCOPES ??
    "read,activity:read_all"; // good default for fitness dashboards

  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeStravaCodeForTokens(code: string) {
  const clientId = requiredEnv("STRAVA_CLIENT_ID");
  const clientSecret = sanitizeEnvSecret("STRAVA_CLIENT_SECRET");

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  const json = (await res.json().catch(() => null)) as StravaTokenResponse | null;
  if (!res.ok || !json) {
    const message =
      typeof (json as any)?.message === "string"
        ? (json as any).message
        : `Strava token exchange failed (${res.status})`;
    throw new Error(message);
  }

  return json;
}

export async function refreshStravaTokens(refreshToken: string) {
  const clientId = requiredEnv("STRAVA_CLIENT_ID");
  const clientSecret = sanitizeEnvSecret("STRAVA_CLIENT_SECRET");

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const json = (await res.json().catch(() => null)) as StravaTokenResponse | null;
  if (!res.ok || !json) {
    const message =
      typeof (json as any)?.message === "string"
        ? (json as any).message
        : `Strava token refresh failed (${res.status})`;
    throw new Error(message);
  }

  return json;
}

async function fetchStravaJson<T>(path: string, accessToken: string) {
  const res = await fetch(`https://www.strava.com/api/v3${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !json) {
    const message =
      typeof (json as any)?.message === "string"
        ? (json as any).message
        : `Strava API request failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}

export type StravaAthleteSummary = {
  id: number;
  username?: string;
  firstname?: string;
  lastname?: string;
  city?: string;
  state?: string;
  country?: string;
} & Record<string, unknown>;

export type StravaActivitySummary = {
  id: number;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date: string;
  start_date_local?: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain?: number;
} & Record<string, unknown>;

export async function getStravaAthlete() {
  const token = await getValidStravaAccessToken();
  if (!token) return null;
  return fetchStravaJson<StravaAthleteSummary>("/athlete", token);
}

export async function getRecentStravaActivities({
  days = 30,
  perPage = 20,
}: {
  days?: number;
  perPage?: number;
} = {}) {
  const token = await getValidStravaAccessToken();
  if (!token) return null;
  const after = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const qs = new URLSearchParams({
    after: String(after),
    per_page: String(perPage),
    page: "1",
  });
  return fetchStravaJson<StravaActivitySummary[]>(
    `/athlete/activities?${qs.toString()}`,
    token,
  );
}

/**
 * Returns a valid Strava access token for a given user (no session cookie required).
 * Use after login or in background jobs. Refreshes and persists tokens when expired.
 */
export async function getValidStravaAccessTokenForUser(userId: string) {
  const account = await prisma().connectedAccount.findUnique({
    where: { userId_provider: { userId, provider: "STRAVA" } },
  });

  if (!account || !account.isActive) return null;

  if (!account.expiresAt) return account.accessToken;

  const now = Date.now();
  const expiresAtMs = account.expiresAt.getTime();

  // Refresh slightly early to avoid race conditions.
  const needsRefresh = expiresAtMs - now < 60_000;
  if (!needsRefresh) return account.accessToken;

  if (!account.refreshToken) {
    throw new Error("Strava refreshToken missing; reconnect Strava.");
  }

  const refreshed = await refreshStravaTokens(account.refreshToken);

  // Strava's refresh_token response does not include `athlete`; only the
  // initial code exchange typically does. Keep the stored provider id.
  const providerAccountId =
    refreshed.athlete?.id != null
      ? String(refreshed.athlete.id)
      : account.providerAccountId?.trim()
        ? account.providerAccountId
        : null;
  if (!providerAccountId) {
    throw new Error(
      "Strava account missing athlete id; disconnect and reconnect Strava.",
    );
  }

  const updated = await prisma().connectedAccount.update({
    where: { id: account.id },
    data: {
      providerAccountId,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenType: refreshed.token_type,
      scope: refreshed.scope ?? account.scope,
      expiresAt: new Date(refreshed.expires_at * 1000),
      rawAuthPayload: refreshed as unknown as object,
      updatedAt: new Date(),
    },
  });

  return updated.accessToken;
}

/**
 * Returns a valid Strava access token for the current session user.
 * If the stored token is expired, it will refresh and persist the new tokens.
 */
export async function getValidStravaAccessToken() {
  const userId = await requireUserId();
  return getValidStravaAccessTokenForUser(userId);
}

