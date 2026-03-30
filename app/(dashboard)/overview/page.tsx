import { ChartCard } from "@/components/dashboard/chart-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { BarChartView } from "@/components/charts/bar-chart";
import { AreaChartView } from "@/components/charts/area-chart";
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

export default async function OverviewPage() {
  const userId = await requireUserId();
  const now = new Date();
  const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [activities7, fitbitWeek, fitbit30] = await Promise.all([
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

  // Distance by day (bar chart)
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

  // Steps by day (bar chart)
  const stepsData = fitbitWeek.map((r) => ({
    day: dayLabel(r.date),
    steps: r.steps ?? 0,
  }));

  // Sleep by night (area chart)
  const sleepData = fitbit30
    .filter((r) => r.sleepMinutes != null && r.sleepMinutes > 0)
    .map((r) => ({
      day: r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      hours: Number(((r.sleepMinutes ?? 0) / 60).toFixed(1)),
    }));

  // Resting HR trend (30d, area chart)
  const rhrData = fitbit30
    .filter((r) => r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0)
    .map((r) => ({
      day: r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      bpm: r.restingHeartRateBpm,
    }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Overview</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-600">
          Your week at a glance from runs (Strava + historical Fitbit logs) and Fitbit wellness data.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Distance" value={`${miles.toFixed(1)} mi`} hint="Last 7 days (runs)" />
        <StatCard title="Time" value={secondsToHhMm(totalSeconds)} hint="Last 7 days (runs)" />
        <StatCard title="Avg pace" value={pace} hint="Last 7 days (moving time)" />
        <StatCard title="Steps" value={totalSteps > 0 ? totalSteps.toLocaleString() : "—"} hint="Last 7 days (Fitbit)" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <StatCard title="Sleep (avg)" value={minutesToHhMm(sleepAvgMin)} hint="Nights with data (Fitbit)" />
        <StatCard title="Resting HR" value={rhrAvg != null ? `${rhrAvg} bpm` : "—"} hint="7-day avg (Fitbit)" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Distance by day" description="Miles per day over the last week" className="lg:col-span-2">
          <BarChartView data={distData} xKey="day" yKey="mi" color={chartPalette.amazon} yUnit=" mi" />
        </ChartCard>
        <ChartCard title="Steps by day" description="Daily movement volume (Fitbit)">
          <BarChartView data={stepsData} xKey="day" yKey="steps" color={chartPalette.cal} />
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Sleep"
          description={sleepAvgMin != null ? `~${minutesToHhMm(sleepAvgMin)} avg · last 30 days` : "Connect Fitbit to see sleep trends"}
        >
          <AreaChartView data={sleepData} xKey="day" yKey="hours" color={chartPalette.un} yUnit=" h" gradientId="sleep" />
        </ChartCard>
        <ChartCard title="Resting heart rate" description="30-day trend (Fitbit)">
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
    </div>
  );
}
