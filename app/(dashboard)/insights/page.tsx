import { ChartCard } from "@/components/dashboard/chart-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { MultiLineChartView } from "@/components/charts/multi-line-chart";
import { BarChartView } from "@/components/charts/bar-chart";
import { AreaChartView } from "@/components/charts/area-chart";
import { AiInsights } from "@/components/dashboard/ai-insights";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { fetchNormalizedRunsInRange } from "@/lib/merged-runs";
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
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [runs30, fitbit30, whoop30] = await Promise.all([
    fetchNormalizedRunsInRange(userId, start30, now),
    prisma().dailyFitbitStat.findMany({
      where: { userId, date: { gte: start30 } },
      select: {
        date: true,
        steps: true,
        sleepMinutes: true,
        restingHeartRateBpm: true,
        activeMinutes: true,
        caloriesOut: true,
        weightKg: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma().dailyWhoopStat.findMany({
      where: { userId, date: { gte: start30 } },
      select: {
        date: true,
        recoveryScore: true,
        strain: true,
        restingHeartRateBpm: true,
        hrvRmssdMs: true,
        sleepMinutes: true,
        sleepPerformancePct: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const runsThisMonth = runs30.length;
  const totalMi30 = runs30.reduce((a, r) => a + metersToMiles(r.distanceMeters ?? 0), 0);
  const runDays = new Set(runs30.map((r) => isoDay(r.startAt)));
  const consistency = Math.min(100, Math.round((runDays.size / 30) * 100));

  const dayVolume = [0, 0, 0, 0, 0, 0, 0];
  for (const r of runs30) dayVolume[r.startAt.getDay()] += r.distanceMeters ?? 0;
  const bestDayIdx = dayVolume.indexOf(Math.max(...dayVolume));
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const weightSeries = fitbit30.filter((r) => r.weightKg != null && r.weightKg > 0);
  const weightFirst = weightSeries[0]?.weightKg ?? null;
  const weightLast = weightSeries[weightSeries.length - 1]?.weightKg ?? null;

  const sleepRows = fitbit30.filter((r) => r.sleepMinutes != null && r.sleepMinutes > 0);
  const avgSleepH =
    sleepRows.length > 0
      ? sleepRows.reduce((a, r) => a + (r.sleepMinutes ?? 0), 0) / sleepRows.length / 60
      : null;

  // WHOOP aggregates
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

  const fitbitByDate = new Map(fitbit30.map((f) => [isoDay(f.date), f]));
  const sleepPace: { day: string; sleep: number | null; pace: number | null }[] = [];
  for (const run of runs30) {
    const prevNight = new Date(run.startAt.getTime() - 24 * 60 * 60 * 1000);
    const prevKey = isoDay(prevNight);
    const f = fitbitByDate.get(prevKey);
    const spm = paceSecondsPerMile({
      seconds: run.movingTimeSec ?? 0,
      meters: run.distanceMeters ?? 0,
    });
    sleepPace.push({
      day: shortDate(run.startAt),
      sleep:
        f?.sleepMinutes != null && f.sleepMinutes > 0
          ? Number((f.sleepMinutes / 60).toFixed(1))
          : null,
      pace: spm != null ? Number((spm / 60).toFixed(2)) : null,
    });
  }

  const weekBuckets = new Map<string, { mi: number; runs: number }>();
  for (const run of runs30) {
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

  const calData = fitbit30
    .filter((r) => r.caloriesOut != null && r.caloriesOut > 0)
    .map((r) => ({
      day: shortDate(r.date),
      cal: r.caloriesOut,
    }));

  const rhrActiveData = fitbit30
    .filter((r) => r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0)
    .map((r) => ({
      day: shortDate(r.date),
      rhr: r.restingHeartRateBpm,
      active: r.activeMinutes ?? 0,
    }));

  const weightChart = weightSeries.map((r) => ({
    day: shortDate(r.date),
    lb: Number(kgToLb(r.weightKg!).toFixed(1)),
  }));

  // WHOOP chart data
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
          AI-powered analysis of your fitness data from Strava, Fitbit, and WHOOP — plus 30-day charts.
        </p>
      </div>

      <AiInsights />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Runs" value={String(runsThisMonth)} hint="Strava + Fitbit · 30d" />
        <StatCard title="Total distance" value={`${totalMi30.toFixed(1)} mi`} hint="Strava + Fitbit · 30d" />
        <StatCard title="Consistency" value={`${consistency}%`} hint="Days with a run / 30" />
        <StatCard title="Best day" value={dayNames[bestDayIdx]} hint="Most run volume" />
        <StatCard
          title="Weight Δ"
          value={
            weightFirst != null && weightLast != null
              ? `${kgToLb(weightLast - weightFirst) >= 0 ? "+" : ""}${kgToLb(weightLast - weightFirst).toFixed(1)} lb`
              : "—"
          }
          hint="Fitbit · first vs last (30d)"
        />
        <StatCard
          title="Sleep (avg)"
          value={avgSleepH != null ? `${avgSleepH.toFixed(1)} h` : "—"}
          hint="Nights with Fitbit sleep"
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

      {recoveryData.length > 0 && (
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
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Sleep vs pace"
          description="Fitbit sleep night before vs Strava/Fitbit run pace (min/mi)"
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
        <ChartCard title="RHR vs active minutes" description="Fitbit resting HR vs active minutes · 30d">
          <MultiLineChartView
            data={rhrActiveData}
            xKey="day"
            lines={[
              { dataKey: "rhr", color: chartPalette.gia, name: "RHR (bpm)", yAxisId: "left" },
              { dataKey: "active", color: chartPalette.amazon, name: "Active min", yAxisId: "right" },
            ]}
            yDomain={["dataMin", "dataMax"]}
            rightYDomain={[0, "dataMax"]}
            height={240}
          />
        </ChartCard>
      </section>

      <section>
        <ChartCard title="Weight" description="Fitbit (lb)">
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

      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Weekly run volume"
          description="Strava + Fitbit · miles per week"
          className="lg:col-span-2"
        >
          <BarChartView data={weeklyData} xKey="week" yKey="mi" color={chartPalette.amazon} yUnit=" mi" />
        </ChartCard>
        <ChartCard title="Activity calories" description="Fitbit daily burn (time series)">
          <AreaChartView
            data={calData}
            xKey="day"
            yKey="cal"
            color={chartPalette.adobe}
            gradientId="ins-cal"
          />
        </ChartCard>
      </section>
    </div>
  );
}
