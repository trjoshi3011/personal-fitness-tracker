import { ChartCard } from "@/components/dashboard/chart-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { AreaChartView } from "@/components/charts/area-chart";
import { BarChartView } from "@/components/charts/bar-chart";
import { MultiLineChartView } from "@/components/charts/multi-line-chart";
import { RunningChat } from "@/components/dashboard/running-chat";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import {
  fetchStravaRunsInRange,
  fetchRecentRunTableRows,
} from "@/lib/merged-runs";
import { chartPalette } from "@/lib/chart-palette";
import {
  formatPaceMinPerMile,
  metersToFeet,
  metersToMiles,
  paceSecondsPerMile,
  secondsToHhMm,
  secondsToHhMmSs,
} from "@/lib/units";

export const dynamic = "force-dynamic";

function shortDay(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function RunningPage() {
  const userId = await requireUserId();
  const now = new Date();
  const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [runs7, recentRuns, whoop7, whoop30] = await Promise.all([
    fetchStravaRunsInRange(userId, start7, now),
    fetchRecentRunTableRows(userId, 30),
    prisma().dailyWhoopStat.findMany({
      where: { userId, date: { gte: start7 } },
      select: { recoveryScore: true, strain: true, hrvRmssdMs: true },
    }),
    prisma().dailyWhoopStat.findMany({
      where: { userId, date: { gte: start30 } },
      select: {
        date: true,
        recoveryScore: true,
        strain: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const runCount = runs7.length;
  const totalMeters = runs7.reduce((acc, r) => acc + (r.distanceMeters ?? 0), 0);
  const totalSeconds = runs7.reduce((acc, r) => acc + (r.movingTimeSec ?? 0), 0);
  const longestMeters = runs7.reduce((acc, r) => Math.max(acc, r.distanceMeters ?? 0), 0);
  const avgPace = formatPaceMinPerMile(paceSecondsPerMile({ seconds: totalSeconds, meters: totalMeters }));

  const wRec = whoop7.filter((r) => r.recoveryScore != null);
  const whoopAvgRecovery =
    wRec.length > 0
      ? Math.round(wRec.reduce((a, r) => a + (r.recoveryScore ?? 0), 0) / wRec.length)
      : null;
  const wStr = whoop7.filter((r) => r.strain != null);
  const whoopAvgStrain =
    wStr.length > 0
      ? wStr.reduce((a, r) => a + (r.strain ?? 0), 0) / wStr.length
      : null;
  const wHrv = whoop7.filter((r) => r.hrvRmssdMs != null && r.hrvRmssdMs > 0);
  const whoopAvgHrv =
    wHrv.length > 0
      ? wHrv.reduce((a, r) => a + (r.hrvRmssdMs ?? 0), 0) / wHrv.length
      : null;

  const whoopRecStrainChart = whoop30
    .filter((r) => r.recoveryScore != null || r.strain != null)
    .map((r) => ({
      day: shortDay(r.date),
      recovery: r.recoveryScore,
      strain: r.strain != null ? Number(r.strain.toFixed(1)) : null,
    }));

  // Pace trend: per-run pace over time (newest last for chart)
  const paceData = [...recentRuns]
    .reverse()
    .filter((r) => (r.distanceMeters ?? 0) > 0 && (r.movingTimeSec ?? 0) > 0)
    .map((r) => {
      const spm = paceSecondsPerMile({
        seconds: r.movingTimeSec ?? 0,
        meters: r.distanceMeters ?? 0,
      });
      return {
        date: r.startAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        pace: spm != null ? Number((spm / 60).toFixed(2)) : null,
      };
    })
    .filter((r) => r.pace != null);

  // Distance per run
  const distPerRun = [...recentRuns]
    .reverse()
    .map((r) => ({
      date: r.startAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      mi: Number(metersToMiles(r.distanceMeters ?? 0).toFixed(2)),
    }));

  // HR per run
  const hrData = [...recentRuns]
    .reverse()
    .filter((r) => r.averageHrBpm != null)
    .map((r) => ({
      date: r.startAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      avg: r.averageHrBpm,
      max: r.maxHrBpm,
    }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Training</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Running</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-600">
          Runs from Strava (with historical Fitbit logs). WHOOP recovery and strain show how your body handles the training load.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Runs" value={String(runCount)} hint="Strava · 7d" />
        <StatCard title="Distance" value={`${metersToMiles(totalMeters).toFixed(1)} mi`} hint="Strava · 7d" />
        <StatCard title="Avg pace" value={avgPace} hint="Strava · 7d" />
        <StatCard title="Longest run" value={`${metersToMiles(longestMeters).toFixed(1)} mi`} hint="Strava · 7d" />
      </section>

      <div>
        <p className="mb-3 text-xs font-medium tracking-wider text-stone-500 uppercase">WHOOP · same week as your runs</p>
        <section className="grid gap-4 md:grid-cols-3">
          <StatCard title="Recovery" value={whoopAvgRecovery != null ? `${whoopAvgRecovery}%` : "—"} hint="7-day avg" />
          <StatCard title="Strain" value={whoopAvgStrain != null ? whoopAvgStrain.toFixed(1) : "—"} hint="7-day avg" />
          <StatCard title="HRV" value={whoopAvgHrv != null ? `${Math.round(whoopAvgHrv)} ms` : "—"} hint="7-day RMSSD" />
        </section>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Pace trend" description="Min/mi per run (lower is faster)" className="lg:col-span-2">
          <AreaChartView
            data={paceData}
            xKey="date"
            yKey="pace"
            color={chartPalette.cal}
            yUnit=" min/mi"
            gradientId="pace"
            yDomain={["dataMin", "dataMax"]}
          />
        </ChartCard>
        <ChartCard title="Distance per run" description="Miles per run">
          <BarChartView data={distPerRun} xKey="date" yKey="mi" color={chartPalette.amazon} yUnit=" mi" />
        </ChartCard>
      </section>

      <section>
        <ChartCard title="Heart rate" description="Per run · Strava & Fitbit logs with HR" contentClassName="pt-0">
          <MultiLineChartView
            data={hrData}
            xKey="date"
            lines={[
              { dataKey: "avg", color: chartPalette.adobe, name: "Avg HR" },
              { dataKey: "max", color: chartPalette.gia, name: "Max HR" },
            ]}
            yDomain={["dataMin", "dataMax"]}
            height={200}
          />
        </ChartCard>
      </section>

      <section>
        <ChartCard
          title="WHOOP recovery vs strain"
          description="Daily physiological load vs readiness · last 30 days"
        >
          <MultiLineChartView
            data={whoopRecStrainChart}
            xKey="day"
            lines={[
              { dataKey: "recovery", color: "#22c55e", name: "Recovery %", yAxisId: "left" },
              { dataKey: "strain", color: chartPalette.adobe, name: "Strain", yAxisId: "right" },
            ]}
            yDomain={[0, 100]}
            rightYDomain={[0, "dataMax"]}
            height={220}
          />
        </ChartCard>
      </section>

      <section>
        <ChartCard
          title="Recent runs"
          description="Last 30 runs (Strava + historical Fitbit logs), newest first"
          contentClassName="pt-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="text-[10px] tracking-wider text-stone-500 uppercase">
                <tr>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-left font-medium">Date</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-left font-medium">Source</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-left font-medium">Run</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">Distance</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">Time</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">Pace</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">Elev</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">Avg HR</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">Max HR</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.length > 0 ? (
                  recentRuns.map((r) => {
                    const meters = r.distanceMeters ?? 0;
                    const sec = r.movingTimeSec ?? 0;
                    const runPace = formatPaceMinPerMile(paceSecondsPerMile({ seconds: sec, meters }));
                    const elevFt = r.totalElevationM ? metersToFeet(r.totalElevationM) : null;
                    return (
                      <tr key={r.rowKey} className="border-t border-amber-900/[0.06] transition-colors hover:bg-amber-50/30">
                        <td className="whitespace-nowrap px-3 py-2.5 text-stone-500">
                          {r.startAt.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">
                          <span className="rounded-md bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-stone-700 uppercase">
                            {r.source === "STRAVA" ? "Strava" : "Fitbit"}
                          </span>
                        </td>
                        <td className="min-w-[220px] px-3 py-2.5">
                          <div className="truncate font-medium text-stone-900">{r.name ?? "Run"}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">
                          {meters > 0 ? `${metersToMiles(meters).toFixed(2)} mi` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">
                          {sec > 0 ? secondsToHhMmSs(sec) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">{runPace}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">
                          {elevFt != null ? `${Math.round(elevFt)} ft` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">{r.averageHrBpm ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">{r.maxHrBpm ?? "—"}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-stone-500">
                      No runs found yet. Click &ldquo;Sync now&rdquo; in Settings.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </section>

      <RunningChat />
    </div>
  );
}
