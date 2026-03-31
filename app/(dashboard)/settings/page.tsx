import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import Link from "next/link";
import { getRecentStravaActivities } from "@/lib/strava";
import { metersToMiles, minutesToHhMm } from "@/lib/units";
import { getTimezones } from "@/lib/timezones";

export const dynamic = "force-dynamic";

type SettingsSearch = {
  strava?: string;
  fitbit?: string;
  whoop?: string;
  reason?: string;
  stravaSync?: string;
  fitbitSync?: string;
  whoopSync?: string;
  fetched?: string;
  upserted?: string;
  profile?: string;
  password?: string;
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<SettingsSearch>;
}) {
  const sp = (await searchParams) ?? {};
  const userId = await requireUserId();
  const timezones = getTimezones();
  const user = await prisma().user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, lastName: true, timezone: true },
  });
  const strava = await prisma().connectedAccount.findUnique({
    where: { userId_provider: { userId, provider: "STRAVA" } },
    select: {
      isActive: true,
      providerAccountId: true,
      expiresAt: true,
      scope: true,
      lastSyncedAt: true,
      updatedAt: true,
    },
  });

  const fitbit = await prisma().connectedAccount.findUnique({
    where: { userId_provider: { userId, provider: "FITBIT" } },
    select: {
      isActive: true,
      providerAccountId: true,
      expiresAt: true,
      scope: true,
      lastSyncedAt: true,
      updatedAt: true,
    },
  });

  const whoop = await prisma().connectedAccount.findUnique({
    where: { userId_provider: { userId, provider: "WHOOP" } },
    select: {
      isActive: true,
      providerAccountId: true,
      expiresAt: true,
      scope: true,
      lastSyncedAt: true,
      updatedAt: true,
    },
  });

  const isConnected = Boolean(strava?.isActive);
  const fitbitConnected = Boolean(fitbit?.isActive);
  const whoopConnected = Boolean(whoop?.isActive);
  const recentActivities = isConnected
    ? await getRecentStravaActivities({ days: 30, perPage: 5 })
    : null;

  const recentFitbitDays =
    fitbitConnected
      ? await prisma().dailyFitbitStat.findMany({
          where: { userId },
          orderBy: { date: "desc" },
          take: 7,
          select: {
            date: true,
            steps: true,
            sleepMinutes: true,
            restingHeartRateBpm: true,
          },
        })
      : [];

  const recentWhoopDays =
    whoopConnected
      ? await prisma().dailyWhoopStat.findMany({
          where: { userId },
          orderBy: { date: "desc" },
          take: 7,
          select: {
            date: true,
            recoveryScore: true,
            strain: true,
            sleepMinutes: true,
            restingHeartRateBpm: true,
          },
        })
      : [];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Configuration</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Settings</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-600">
          Configure integrations, units, goals, and data preferences.
        </p>
      </div>

      {(sp.strava === "connected" ||
        sp.fitbit === "connected" ||
        sp.whoop === "connected" ||
        sp.strava === "error" ||
        sp.fitbit === "error" ||
        sp.whoop === "error" ||
        sp.stravaSync ||
        sp.fitbitSync ||
        sp.whoopSync ||
        sp.profile ||
        sp.password) && (
        <div className="space-y-2 rounded-xl border border-amber-900/15 bg-card/80 p-4 text-sm text-stone-700">
          {sp.strava === "connected" ? (
            <p>Strava connected successfully.</p>
          ) : null}
          {sp.fitbit === "connected" ? (
            <p>Fitbit connected successfully.</p>
          ) : null}
          {sp.whoop === "connected" ? (
            <p>WHOOP connected successfully.</p>
          ) : null}
          {sp.strava === "error" ? (
            <p className="text-orange-900">
              Strava connection failed
              {sp.reason ? `: ${sp.reason}` : ""}.
            </p>
          ) : null}
          {sp.fitbit === "error" ? (
            <p className="text-orange-900">
              Fitbit connection failed
              {sp.reason ? `: ${sp.reason}` : ""}.
            </p>
          ) : null}
          {sp.whoop === "error" ? (
            <p className="text-orange-900">
              WHOOP connection failed
              {sp.reason ? `: ${sp.reason}` : ""}.
            </p>
          ) : null}
          {sp.stravaSync === "ok" ? (
            <p>
              Strava sync finished (fetched {sp.fetched ?? "—"}, saved{" "}
              {sp.upserted ?? "—"}).
            </p>
          ) : null}
          {sp.stravaSync === "error" ? (
            <p className="text-orange-900">Strava sync failed.</p>
          ) : null}
          {sp.stravaSync === "not_connected" ? (
            <p className="text-orange-900">Connect Strava before syncing.</p>
          ) : null}
          {sp.fitbitSync === "ok" ? (
            <p>
              Fitbit sync finished (fetched {sp.fetched ?? "—"}, saved{" "}
              {sp.upserted ?? "—"} daily rows).
            </p>
          ) : null}
          {sp.fitbitSync === "error" ? (
            <p className="text-orange-900">Fitbit sync failed.</p>
          ) : null}
          {sp.fitbitSync === "not_connected" ? (
            <p className="text-orange-900">Connect Fitbit before syncing.</p>
          ) : null}
          {sp.whoopSync === "ok" ? (
            <p>
              WHOOP sync finished (fetched {sp.fetched ?? "—"}, saved{" "}
              {sp.upserted ?? "—"} daily rows).
            </p>
          ) : null}
          {sp.whoopSync === "error" ? (
            <p className="text-orange-900">WHOOP sync failed.</p>
          ) : null}
          {sp.whoopSync === "not_connected" ? (
            <p className="text-orange-900">Connect WHOOP before syncing.</p>
          ) : null}
          {sp.profile === "ok" ? (
            <p>Profile updated successfully.</p>
          ) : null}
          {sp.profile === "error" ? (
            <p className="text-orange-900">
              Could not update profile
              {sp.reason ? `: ${sp.reason}` : ""}.
            </p>
          ) : null}
          {sp.password === "error" ? (
            <p className="text-orange-900">
              Could not change password
              {sp.reason ? `: ${sp.reason}` : ""}.
            </p>
          ) : null}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-stone-900">Strava</div>
              <div className="mt-1 text-sm text-stone-500">
                {isConnected
                  ? `Connected (athlete ${strava?.providerAccountId})`
                  : "Not connected"}
              </div>
              {isConnected ? (
                <div className="mt-1 text-xs text-stone-500">
                  Scope: {strava?.scope ?? "unknown"} · Expires:{" "}
                  {strava?.expiresAt ? strava.expiresAt.toLocaleString() : "unknown"}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/api/strava/connect"
                className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800"
              >
                {isConnected ? "Reconnect Strava" : "Connect Strava"}
              </Link>
              {isConnected ? (
                <form action="/api/strava/sync?days=90" method="post">
                  <button className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-900/15 bg-card/75 px-4 text-sm font-medium text-stone-700 transition-all hover:border-orange-500/40 hover:bg-orange-50/75 hover:text-orange-700">
                    Sync now
                  </button>
                </form>
              ) : null}
            </div>
          </div>
          {isConnected ? (
            <div className="space-y-3">
              <div className="text-xs text-stone-500">
                Last updated: {strava?.updatedAt.toLocaleString()} · Last synced:{" "}
                {strava?.lastSyncedAt
                  ? strava.lastSyncedAt.toLocaleString()
                  : "never"}
              </div>
              <div className="rounded-xl border border-amber-900/10 bg-card/55 p-4">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Recent activities (last 30 days)
                </div>
                {recentActivities && recentActivities.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {recentActivities.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3">
                        <span className="truncate text-stone-700">
                          {a.name ?? "Activity"}{" "}
                          <span className="text-xs text-stone-500">
                            ({a.sport_type ?? a.type ?? "unknown"})
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-stone-500">
                          {metersToMiles(a.distance).toFixed(2)} mi
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3 text-sm text-stone-500">
                    No recent activities found (or missing permissions).
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="border-t border-amber-900/10 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium text-stone-900">Fitbit</div>
                <div className="mt-1 text-sm text-stone-500">
                  {fitbitConnected
                    ? `Connected (user ${fitbit?.providerAccountId})`
                    : "Not connected"}
                </div>
                {fitbitConnected ? (
                  <div className="mt-1 text-xs text-stone-500">
                    Scope: {fitbit?.scope ?? "unknown"} · Expires:{" "}
                    {fitbit?.expiresAt
                      ? fitbit.expiresAt.toLocaleString()
                      : "unknown"}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/api/fitbit/connect"
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800"
                >
                  {fitbitConnected ? "Reconnect Fitbit" : "Connect Fitbit"}
                </Link>
                {fitbitConnected ? (
                  <form action="/api/fitbit/sync?days=90" method="post">
                    <button className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-900/15 bg-card/75 px-4 text-sm font-medium text-stone-700 transition-all hover:border-orange-500/40 hover:bg-orange-50/75 hover:text-orange-700">
                      Sync now
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
            {fitbitConnected ? (
              <div className="mt-4 space-y-3">
                <div className="text-xs text-stone-500">
                  Last updated: {fitbit?.updatedAt.toLocaleString()} · Last
                  synced:{" "}
                  {fitbit?.lastSyncedAt
                    ? fitbit.lastSyncedAt.toLocaleString()
                    : "never"}
                  . Each sync also pulls{" "}
                  <span className="font-medium text-stone-700">
                    Fitbit exercise logs
                  </span>{" "}
                  (runs from your tracker or app) so they show on Running / Journey
                  even if they never existed in Strava.
                </div>
                <div className="rounded-xl border border-amber-900/10 bg-card/55 p-4">
                  <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                    Recent daily stats (latest 7 in DB)
                  </div>
                  {recentFitbitDays.length > 0 ? (
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {recentFitbitDays.map((row) => (
                        <li
                          key={row.date.toISOString()}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="text-stone-600">
                            {row.date.toLocaleDateString()}
                          </span>
                          <span className="text-xs text-stone-500">
                            {row.steps != null ? `${row.steps.toLocaleString()} steps` : "—"}{" "}
                            · sleep {minutesToHhMm(row.sleepMinutes)}{" "}
                            {row.restingHeartRateBpm != null
                              ? `· RHR ${row.restingHeartRateBpm}`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-3 text-sm text-stone-500">
                      No Fitbit rows yet — run a sync after connecting.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-amber-900/10 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium text-stone-900">WHOOP</div>
                <div className="mt-1 text-sm text-stone-500">
                  {whoopConnected
                    ? `Connected (user ${whoop?.providerAccountId})`
                    : "Not connected"}
                </div>
                {whoopConnected ? (
                  <div className="mt-1 text-xs text-stone-500">
                    Scope: {whoop?.scope ?? "unknown"} · Expires:{" "}
                    {whoop?.expiresAt
                      ? whoop.expiresAt.toLocaleString()
                      : "unknown"}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/api/whoop/connect"
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800"
                >
                  {whoopConnected ? "Reconnect WHOOP" : "Connect WHOOP"}
                </Link>
                {whoopConnected ? (
                  <form action="/api/whoop/sync?days=90" method="post">
                    <button className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-900/15 bg-card/75 px-4 text-sm font-medium text-stone-700 transition-all hover:border-orange-500/40 hover:bg-orange-50/75 hover:text-orange-700">
                      Sync now
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
            {whoopConnected ? (
              <div className="mt-4 space-y-3">
                <div className="text-xs text-stone-500">
                  Last updated: {whoop?.updatedAt.toLocaleString()} · Last synced:{" "}
                  {whoop?.lastSyncedAt
                    ? whoop.lastSyncedAt.toLocaleString()
                    : "never"}
                  . Sync stores daily recovery, strain, and sleep metrics from WHOOP.
                </div>
                <div className="rounded-xl border border-amber-900/10 bg-card/55 p-4">
                  <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                    Recent WHOOP days (latest 7 in DB)
                  </div>
                  {recentWhoopDays.length > 0 ? (
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {recentWhoopDays.map((row) => (
                        <li
                          key={row.date.toISOString()}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="text-stone-600">
                            {row.date.toLocaleDateString()}
                          </span>
                          <span className="text-xs text-stone-500">
                            {row.recoveryScore != null
                              ? `Recovery ${row.recoveryScore}%`
                              : "—"}
                            {row.strain != null
                              ? ` · strain ${row.strain.toFixed(1)}`
                              : ""}
                            {" · sleep "}
                            {minutesToHhMm(row.sleepMinutes)}
                            {row.restingHeartRateBpm != null
                              ? ` · RHR ${row.restingHeartRateBpm}`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-3 text-sm text-stone-500">
                      No WHOOP rows yet — run a sync after connecting.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-amber-900/10 pt-6">
            <div className="text-sm font-medium text-stone-900">Long-term backfill</div>
            <p className="mt-1 text-xs text-stone-600 leading-relaxed">
              Everything you sync is kept in the database. Strava can backfill years. Fitbit daily stats
              deep sync is limited to ~6 months; the same full Fitbit sync also pulls up to ~12 months of{" "}
              <span className="font-medium text-stone-800">logged runs</span> from Fitbit (exercise history).
              WHOOP recovery sync is limited to about six months per request.
              Monthly rollups on the{" "}
              <Link
                href="/journey"
                className="font-medium text-orange-800 underline-offset-2 hover:underline"
              >
                Journey
              </Link>{" "}
              page refresh automatically after each successful sync.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {isConnected ? (
                <form action="/api/strava/sync?days=1095" method="post">
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-900/20 bg-amber-50/80 px-3 text-xs font-medium text-stone-800 transition-all hover:border-orange-500/40 hover:bg-amber-50"
                  >
                    Strava · ~3 years
                  </button>
                </form>
              ) : null}
              {fitbitConnected ? (
                <form action="/api/fitbit/sync?days=183" method="post">
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-900/20 bg-amber-50/80 px-3 text-xs font-medium text-stone-800 transition-all hover:border-orange-500/40 hover:bg-amber-50"
                  >
                    Fitbit · ~6 months
                  </button>
                </form>
              ) : null}
              {whoopConnected ? (
                <form action="/api/whoop/sync?days=180" method="post">
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-900/20 bg-amber-50/80 px-3 text-xs font-medium text-stone-800 transition-all hover:border-orange-500/40 hover:bg-amber-50"
                  >
                    WHOOP · ~6 months
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form action="/api/settings/profile" method="post" className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                    First name
                  </div>
                  <input
                    name="firstName"
                    required
                    defaultValue={user?.firstName ?? ""}
                    className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
                  />
                </label>
                <label className="block">
                  <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                    Last name
                  </div>
                  <input
                    name="lastName"
                    required
                    defaultValue={user?.lastName ?? ""}
                    className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
                  />
                </label>
              </div>

              <label className="block">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Email
                </div>
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={user?.email ?? ""}
                  className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
                />
              </label>

              <label className="block">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Timezone
                </div>
                <select
                  name="timezone"
                  required
                  defaultValue={user?.timezone ?? "UTC"}
                  className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
                >
                  {timezones.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </label>

              <button className="inline-flex h-10 items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800">
                Save profile
              </button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
          </CardHeader>
          <CardContent>
            <form action="/api/settings/password" method="post" className="space-y-3">
              <label className="block">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Current password
                </div>
                <input
                  name="currentPassword"
                  type="password"
                  required
                  className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
                />
              </label>

              <label className="block">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  New password
                </div>
                <input
                  name="newPassword"
                  type="password"
                  minLength={8}
                  required
                  className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
                />
              </label>

              <label className="block">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Confirm new password
                </div>
                <input
                  name="confirmPassword"
                  type="password"
                  minLength={8}
                  required
                  className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
                />
              </label>

              <p className="text-xs text-stone-500">
                Changing your password will sign you out from all devices.
              </p>

              <button className="inline-flex h-10 items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800">
                Update password
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
