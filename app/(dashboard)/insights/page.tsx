import { ChartCard } from "@/components/dashboard/chart-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { MultiLineChartView } from "@/components/charts/multi-line-chart";
import { BarChartView } from "@/components/charts/bar-chart";
import { AreaChartView } from "@/components/charts/area-chart";
import { AiInsights } from "@/components/dashboard/ai-insights";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { fetchStravaRunsInRange } from "@/lib/merged-runs";
import { utcCalendarWindowBoundsMs } from "@/lib/calendar-range";
import { chartPalette } from "@/lib/chart-palette";
import {
  kgToLb,
  metersToMiles,
  paceSecondsPerMile,
} from "@/lib/units";

export const dynamic = "force-dynamic";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shortDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function InsightsPage() {
  const userId = await requireUserId();
  const now = new Date();
  const { startMs, endMs, daysInWindow } = utcCalendarWindowBoundsMs(30, now);
  const rangeStart = new Date(startMs);
  const rangeEnd = new Date(endMs);

  const [runs30, fitbit30, whoop30] = await Promise.all([
    fetchStravaRunsInRange(userId, rangeStart, rangeEnd),
    prisma().dailyFitbitStat.findMany({
      where: { userId, date: { gte: rangeStart, lte: rangeEnd } },
      select: {
        date: true,
        sleepMinutes: true,
        restingHeartRateBpm: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma().dailyWhoopStat.findMany({
      where: { userId, date: { gte: rangeStart, lte: rangeEnd } },
      select: {
        date: true,
        recoveryScore: true,
        strain: true,
        restingHeartRateBpm: true,
        hrvRmssdMs: true,
        sleepMinutes: true,
        sleepPerformancePct: true,
        sleepEfficiencyPct: true,
        weightKg: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const runsInWindow = runs30.filter(
    (r) => r.startAt.getTime() >= startMs && r.startAt.getTime() <= endMs,
  );

  const runsThisMonth = runsInWindow.length;
  const totalMi30 = runsInWindow.reduce((a, r) => a + metersToMiles(r.distanceMeters ?? 0), 0);
  const runDays = new Set(runsInWindow.map((r) => isoDay(r.startAt)));
  const consistency = Math.min(
    100,
    Math.round((runDays.size / Math.max(1, daysInWindow)) * 100),
  );

  const volByUtcDay = new Map<string, number>();
  for (const r of runsInWindow) {
    const k = isoDay(r.startAt);
    volByUtcDay.set(k, (volByUtcDay.get(k) ?? 0) + (r.distanceMeters ?? 0));
  }
  let bestDayKey: string | null = null;
  let bestMeters = 0;
  for (const [k, m] of volByUtcDay) {
    if (m > bestMeters) {
      bestMeters = m;
      bestDayKey = k;
    }
  }
  const bestDayLabel =
    bestDayKey != null && bestMeters > 0
      ? new Date(`${bestDayKey}T12:00:00.000Z`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";

  const weightSeries = whoop30.filter((r) => r.weightKg != null && r.weightKg > 0);
  const weightFirst = weightSeries[0]?.weightKg ?? null;
  const weightLast = weightSeries[weightSeries.length - 1]?.weightKg ?? null;

  const sleepByDay30 = new Map<string, number>();
  for (const r of fitbit30) {
    if (r.sleepMinutes != null && r.sleepMinutes > 0) sleepByDay30.set(isoDay(r.date), r.sleepMinutes);
  }
  for (const r of whoop30) {
    if (r.sleepMinutes != null && r.sleepMinutes > 0) sleepByDay30.set(isoDay(r.date), r.sleepMinutes);
  }
  const mergedSleepVals = [...sleepByDay30.values()];
  const avgSleepH =
    mergedSleepVals.length > 0
      ? mergedSleepVals.reduce((a, v) => a + v, 0) / mergedSleepVals.length / 60
      : null;

  const recoveryRows = whoop30.filter((r) => r.recoveryScore != null);
  const avgRecovery =
    recoveryRows.length > 0
      ? Math.round(recoveryRows.reduce((a, r) => a + (r.recoveryScore ?? 0), 0) / recoveryRows.length)
      : null;
  const hrvRows = whoop30.filter((r) => r.hrvRmssdMs != null && r.hrvRmssdMs > 0);
  const avgHrv =
    hrvRows.length > 0
      ? hrvRows.reduce((a, r) => a + (r.hrvRmssdMs ?? 0), 0) / hrvRows.length
      : null;

  const sleepByDateMerged = new Map<string, number>();
  for (const f of fitbit30) {
    if (f.sleepMinutes != null && f.sleepMinutes > 0) sleepByDateMerged.set(isoDay(f.date), f.sleepMinutes);
  }
  for (const w of whoop30) {
    if (w.sleepMinutes != null && w.sleepMinutes > 0) sleepByDateMerged.set(isoDay(w.date), w.sleepMinutes);
  }
  const sleepPace: { day: string; sleep: number | null; pace: number | null }[] = [];
  for (const run of runsInWindow) {
    const prevNight = new Date(run.startAt.getTime() - 24 * 60 * 60 * 1000);
    const prevKey = isoDay(prevNight);
    const prevSleepMin = sleepByDateMerged.get(prevKey);
    const spm = paceSecondsPerMile({
      seconds: run.movingTimeSec ?? 0,
      meters: run.distanceMeters ?? 0,
    });
    sleepPace.push({
      day: shortDate(run.startAt),
      sleep:
        prevSleepMin != null && prevSleepMin > 0
          ? Number((prevSleepMin / 60).toFixed(1))
          : null,
      pace: spm != null ? Number((spm / 60).toFixed(2)) : null,
    });
  }

  const weekBuckets = new Map<string, { mi: number; runs: number }>();
  for (const run of runsInWindow) {
    const d = new Date(run.startAt);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = shortDate(weekStart);
    const cur = weekBuckets.get(key) ?? { mi: 0, runs: 0 };
    cur.mi += metersToMiles(run.distanceMeters ?? 0);
    cur.runs += 1;
    weekBuckets.set(key, cur);
  }
  const weeklyData = [...weekBuckets.entries()].map(([wk, v]) => ({
    week: wk,
    mi: Number(v.mi.toFixed(1)),
    runs: v.runs,
  }));

  const rhrByDay = new Map<string, { date: Date; rhr: number }>();
  for (const r of fitbit30) {
    if (r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0)
      rhrByDay.set(isoDay(r.date), { date: r.date, rhr: r.restingHeartRateBpm });
  }
  for (const r of whoop30) {
    if (r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0)
      rhrByDay.set(isoDay(r.date), { date: r.date, rhr: r.restingHeartRateBpm });
  }
  const rhrData = [...rhrByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      day: shortDate(v.date),
      rhr: v.rhr,
    }));

  const weightChart = weightSeries.map((r) => ({
    day: shortDate(r.date),
    lb: Number(kgToLb(r.weightKg!).toFixed(1)),
  }));

  const recoveryData = whoop30
    .filter((r) => r.recoveryScore != null)
    .map((r) => ({
      day: shortDate(r.date),
      recovery: r.recoveryScore,
      strain: r.strain != null ? Number(r.strain.toFixed(1)) : null,
    }));

  const hrvData = whoop30
    .filter((r) => r.hrvRmssdMs != null && r.hrvRmssdMs > 0)
    .map((r) => ({
      day: shortDate(r.date),
      hrv: Number((r.hrvRmssdMs ?? 0).toFixed(0)),
    }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Insights</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-600">
          Strava runs and WHOOP metrics over the last 30 UTC calendar days. Sleep merges WHOOP with historical Fitbit;
          weight comes from WHOOP body measurements after sync.
        </p>
      </div>

      <AiInsights />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Runs" value={String(runsThisMonth)} hint={`Strava · ${daysInWindow}d window`} />
        <StatCard title="Total distance" value={`${totalMi30.toFixed(1)} mi`} hint={`Strava · ${daysInWindow}d window`} />
        <StatCard
          title="Consistency"
          value={`${consistency}%`}
          hint={`Run days / ${daysInWindow} calendar days (UTC)`}
        />
        <StatCard title="Best day" value={bestDayLabel} hint="Most run distance (single UTC day)" />
        <StatCard
          title="Weight Δ"
          value={
            weightFirst != null && weightLast != null
              ? `${kgToLb(weightLast - weightFirst) >= 0 ? "+" : ""}${kgToLb(weightLast - weightFirst).toFixed(1)} lb`
              : "—"
          }
          hint="WHOOP · first vs last in window"
        />
        <StatCard
          title="Sleep (avg)"
          value={avgSleepH != null ? `${avgSleepH.toFixed(1)} h` : "—"}
          hint="WHOOP + Fitbit · 30d"
        />
        <StatCard
          title="Recovery"
          value={avgRecovery != null ? `${avgRecovery}%` : "—"}
          hint="30-day avg (WHOOP)"
        />
        <StatCard
          title="HRV"
          value={avgHrv != null ? `${avgHrv.toFixed(0)} ms` : "—"}
          hint="30-day avg RMSSD (WHOOP)"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="WHOOP Recovery vs Strain" description="Daily recovery % and strain score">
          <MultiLineChartView
            data={recoveryData}
            xKey="day"
            lines={[
              { dataKey: "recovery", color: "#22c55e", name: "Recovery %", yAxisId: "left" },
              { dataKey: "strain", color: chartPalette.adobe, name: "Strain", yAxisId: "right" },
            ]}
            yDomain={[0, 100]}
            rightYDomain={[0, "dataMax"]}
            height={240}
          />
        </ChartCard>
        <ChartCard title="Heart Rate Variability" description="WHOOP HRV RMSSD (ms) — higher = better recovered">
          <AreaChartView
            data={hrvData}
            xKey="day"
            yKey="hrv"
            color="#22c55e"
            yUnit=" ms"
            gradientId="ins-hrv"
            height={240}
            yDomain={["dataMin", "dataMax"]}
          />
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Sleep vs pace"
          description="Sleep night before (WHOOP + Fitbit) vs run pace (min/mi)"
        >
          <MultiLineChartView
            data={sleepPace}
            xKey="day"
            lines={[
              { dataKey: "sleep", color: chartPalette.un, name: "Sleep (h)", yAxisId: "left" },
              { dataKey: "pace", color: chartPalette.cal, name: "Pace (min/mi)", yAxisId: "right" },
            ]}
            yDomain={[0, "dataMax"]}
            rightYDomain={["dataMin", "dataMax"]}
            height={240}
          />
        </ChartCard>
        <ChartCard title="Resting heart rate" description="WHOOP + Fitbit · 30d">
          <AreaChartView
            data={rhrData}
            xKey="day"
            yKey="rhr"
            color={chartPalette.gia}
            yUnit=" bpm"
            gradientId="ins-rhr"
            height={240}
            yDomain={["dataMin", "dataMax"]}
          />
        </ChartCard>
      </section>

      <section>
        <ChartCard title="Weight" description="WHOOP body measurement (lb)">
          <AreaChartView
            data={weightChart}
            xKey="day"
            yKey="lb"
            color={chartPalette.gia}
            yUnit=" lb"
            gradientId="ins-wt"
            height={220}
            yDomain={["dataMin", "dataMax"]}
          />
        </ChartCard>
      </section>

      <section>
        <ChartCard title="Weekly run volume" description="Strava · miles per week (runs in window)">
          <BarChartView data={weeklyData} xKey="week" yKey="mi" color={chartPalette.amazon} yUnit=" mi" />
        </ChartCard>
      </section>
    </div>
  );
}
