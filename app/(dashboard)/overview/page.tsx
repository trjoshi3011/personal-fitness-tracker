import { ChartCard } from "@/components/dashboard/chart-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { BarChartView } from "@/components/charts/bar-chart";
import { AreaChartView } from "@/components/charts/area-chart";
import { MultiLineChartView } from "@/components/charts/multi-line-chart";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { fetchNormalizedRunsInRange } from "@/lib/merged-runs";
import { chartPalette } from "@/lib/chart-palette";
import {
  formatPaceMinPerMile,
  metersToMiles,
  minutesToHhMm,
  paceSecondsPerMile,
  secondsToHhMm,
} from "@/lib/units";

export const dynamic = "force-dynamic";

function dayLabel(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shortDay(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function OverviewPage() {
  const userId = await requireUserId();
  const now = new Date();
  const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [activities7, fitbitWeek, fitbit30, whoopWeek, whoop30] = await Promise.all([
    fetchNormalizedRunsInRange(userId, start7, now),
    prisma().dailyFitbitStat.findMany({
      where: { userId, date: { gte: start7 } },
      select: { date: true, steps: true, sleepMinutes: true, restingHeartRateBpm: true },
      orderBy: { date: "asc" },
    }),
    prisma().dailyFitbitStat.findMany({
      where: { userId, date: { gte: start30 } },
      select: { date: true, steps: true, sleepMinutes: true, restingHeartRateBpm: true },
      orderBy: { date: "asc" },
    }),
    prisma().dailyWhoopStat.findMany({
      where: { userId, date: { gte: start7 } },
      select: {
        date: true,
        recoveryScore: true,
        strain: true,
        hrvRmssdMs: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma().dailyWhoopStat.findMany({
      where: { userId, date: { gte: start30 } },
      select: {
        date: true,
        recoveryScore: true,
        strain: true,
        hrvRmssdMs: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const totalMeters = activities7.reduce((a, r) => a + (r.distanceMeters ?? 0), 0);
  const totalSeconds = activities7.reduce((a, r) => a + (r.movingTimeSec ?? 0), 0);
  const miles = metersToMiles(totalMeters);
  const pace = formatPaceMinPerMile(paceSecondsPerMile({ seconds: totalSeconds, meters: totalMeters }));
  const totalSteps = fitbitWeek.reduce((a, r) => a + (r.steps ?? 0), 0);
  const sleepRows = fitbitWeek.filter((r) => r.sleepMinutes != null && r.sleepMinutes > 0);
  const sleepAvgMin = sleepRows.length > 0
    ? Math.round(sleepRows.reduce((a, r) => a + (r.sleepMinutes ?? 0), 0) / sleepRows.length)
    : null;
  const rhrRows = fitbitWeek.filter((r) => r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0);
  const rhrAvg = rhrRows.length > 0
    ? Math.round(rhrRows.reduce((a, r) => a + (r.restingHeartRateBpm ?? 0), 0) / rhrRows.length)
    : null;

  const whoopRec = whoopWeek.filter((r) => r.recoveryScore != null);
  const whoopAvgRecovery =
    whoopRec.length > 0
      ? Math.round(whoopRec.reduce((a, r) => a + (r.recoveryScore ?? 0), 0) / whoopRec.length)
      : null;
  const whoopStr = whoopWeek.filter((r) => r.strain != null);
  const whoopAvgStrain =
    whoopStr.length > 0
      ? whoopStr.reduce((a, r) => a + (r.strain ?? 0), 0) / whoopStr.length
      : null;
  const whoopHrv = whoopWeek.filter((r) => r.hrvRmssdMs != null && r.hrvRmssdMs > 0);
  const whoopAvgHrv =
    whoopHrv.length > 0
      ? whoopHrv.reduce((a, r) => a + (r.hrvRmssdMs ?? 0), 0) / whoopHrv.length
      : null;

  // Distance by day (bar chart) — Strava + Fitbit exercise logs
  const distByDay = new Map<string, { label: string; mi: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    distByDay.set(isoDay(d), { label: dayLabel(d), mi: 0 });
  }
  for (const a of activities7) {
    const key = isoDay(a.startAt);
    const entry = distByDay.get(key);
    if (entry) entry.mi += metersToMiles(a.distanceMeters ?? 0);
  }
  const distData = [...distByDay.values()].map((d) => ({
    day: d.label,
    mi: Number(d.mi.toFixed(2)),
  }));

  const stepsData = fitbitWeek.map((r) => ({
    day: dayLabel(r.date),
    steps: r.steps ?? 0,
  }));

  const sleepData = fitbit30
    .filter((r) => r.sleepMinutes != null && r.sleepMinutes > 0)
    .map((r) => ({
      day: r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      hours: Number(((r.sleepMinutes ?? 0) / 60).toFixed(1)),
    }));

  const rhrData = fitbit30
    .filter((r) => r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0)
    .map((r) => ({
      day: r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      bpm: r.restingHeartRateBpm,
    }));

  const whoopRecStrainData = whoop30
    .filter((r) => r.recoveryScore != null || r.strain != null)
    .map((r) => ({
      day: shortDay(r.date),
      recovery: r.recoveryScore,
      strain: r.strain != null ? Number(r.strain.toFixed(1)) : null,
    }));

  const whoopHrvData = whoop30
    .filter((r) => r.hrvRmssdMs != null && r.hrvRmssdMs > 0)
    .map((r) => ({
      day: shortDay(r.date),
      hrv: Math.round(r.hrvRmssdMs ?? 0),
    }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Overview</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-600">
          Runs from Strava and Fitbit logs; daily wellness from Fitbit; recovery and strain from WHOOP when connected.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Distance" value={`${miles.toFixed(1)} mi`} hint="Strava + Fitbit · 7d" />
        <StatCard title="Time" value={secondsToHhMm(totalSeconds)} hint="Strava + Fitbit · 7d" />
        <StatCard title="Avg pace" value={pace} hint="Strava + Fitbit · 7d" />
        <StatCard title="Steps" value={totalSteps > 0 ? totalSteps.toLocaleString() : "—"} hint="Fitbit · 7d" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Sleep (avg)" value={minutesToHhMm(sleepAvgMin)} hint="Fitbit · 7d" />
        <StatCard title="Resting HR" value={rhrAvg != null ? `${rhrAvg} bpm` : "—"} hint="Fitbit · 7d avg" />
        <StatCard
          title="Recovery"
          value={whoopAvgRecovery != null ? `${whoopAvgRecovery}%` : "—"}
          hint="WHOOP · 7d avg"
        />
        <StatCard
          title="Strain"
          value={whoopAvgStrain != null ? whoopAvgStrain.toFixed(1) : "—"}
          hint="WHOOP · 7d avg"
        />
        <StatCard
          title="HRV"
          value={whoopAvgHrv != null ? `${Math.round(whoopAvgHrv)} ms` : "—"}
          hint="WHOOP · 7d RMSSD"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Distance by day" description="Miles from runs · Strava + Fitbit" className="lg:col-span-2">
          <BarChartView data={distData} xKey="day" yKey="mi" color={chartPalette.amazon} yUnit=" mi" />
        </ChartCard>
        <ChartCard title="Steps by day" description="Fitbit daily steps">
          <BarChartView data={stepsData} xKey="day" yKey="steps" color={chartPalette.cal} />
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Sleep"
          description={sleepAvgMin != null ? `Fitbit · ~${minutesToHhMm(sleepAvgMin)} avg · 30d` : "Connect Fitbit for sleep"}
        >
          <AreaChartView data={sleepData} xKey="day" yKey="hours" color={chartPalette.un} yUnit=" h" gradientId="sleep" />
        </ChartCard>
        <ChartCard title="Resting heart rate" description="Fitbit · 30d">
          <AreaChartView
            data={rhrData}
            xKey="day"
            yKey="bpm"
            color={chartPalette.gia}
            yUnit=""
            gradientId="rhr"
            yDomain={["dataMin", "dataMax"]}
          />
        </ChartCard>
      </section>

      {whoop30.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="WHOOP recovery vs strain" description="Daily scores · last 30 days">
            <MultiLineChartView
              data={whoopRecStrainData}
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
          <ChartCard title="Heart rate variability" description="WHOOP HRV (RMSSD) · 30d">
            <AreaChartView
              data={whoopHrvData}
              xKey="day"
              yKey="hrv"
              color="#22c55e"
              yUnit=" ms"
              gradientId="ov-hrv"
              height={220}
              yDomain={["dataMin", "dataMax"]}
            />
          </ChartCard>
        </section>
      )}
    </div>
  );
}
