import { ChartCard } from "@/components/dashboard/chart-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { AreaChartView } from "@/components/charts/area-chart";
import { MultiLineChartView } from "@/components/charts/multi-line-chart";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { chartPalette } from "@/lib/chart-palette";
import { kgToLb, minutesToHhMm } from "@/lib/units";

export const dynamic = "force-dynamic";

function shortDay(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function RecoveryPage() {
  const userId = await requireUserId();
  const now = new Date();
  const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [week, month, whoopWeek, whoopMonth] = await Promise.all([
    prisma().dailyFitbitStat.findMany({
      where: { userId, date: { gte: start7 } },
      select: {
        date: true,
        sleepMinutes: true,
        sleepEfficiency: true,
        restingHeartRateBpm: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma().dailyFitbitStat.findMany({
      where: { userId, date: { gte: start30 } },
      select: {
        date: true,
        sleepMinutes: true,
        sleepEfficiency: true,
        restingHeartRateBpm: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma().dailyWhoopStat.findMany({
      where: { userId, date: { gte: start7 } },
      select: {
        date: true,
        recoveryScore: true,
        strain: true,
        hrvRmssdMs: true,
        sleepMinutes: true,
        sleepPerformancePct: true,
        restingHeartRateBpm: true,
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
        hrvRmssdMs: true,
        sleepMinutes: true,
        sleepPerformancePct: true,
        sleepEfficiencyPct: true,
        restingHeartRateBpm: true,
        weightKg: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  // Sleep average (30d): WHOOP primary, Fitbit fallback
  const sleepByDay30 = new Map<string, number>();
  for (const r of month) {
    if (r.sleepMinutes != null && r.sleepMinutes > 0) sleepByDay30.set(isoDay(r.date), r.sleepMinutes);
  }
  for (const r of whoopMonth) {
    if (r.sleepMinutes != null && r.sleepMinutes > 0) sleepByDay30.set(isoDay(r.date), r.sleepMinutes);
  }
  const mergedSleep30 = [...sleepByDay30.values()];
  const sleepAvgMin =
    mergedSleep30.length > 0
      ? Math.round(mergedSleep30.reduce((a, v) => a + v, 0) / mergedSleep30.length)
      : null;

  const effRows = month.filter((r) => r.sleepEfficiency != null && r.sleepEfficiency > 0);
  const sleepEffAvg =
    effRows.length > 0
      ? Math.round(effRows.reduce((a, r) => a + (r.sleepEfficiency ?? 0), 0) / effRows.length)
      : null;

  const rhrByDay7 = new Map<string, number>();
  for (const r of week) {
    if (r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0) rhrByDay7.set(isoDay(r.date), r.restingHeartRateBpm);
  }
  for (const r of whoopWeek) {
    if (r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0) rhrByDay7.set(isoDay(r.date), r.restingHeartRateBpm);
  }
  const mergedRhr7 = [...rhrByDay7.values()];
  const rhrAvg =
    mergedRhr7.length > 0
      ? Math.round(mergedRhr7.reduce((a, v) => a + v, 0) / mergedRhr7.length)
      : null;

  const weightRows30 = whoopMonth.filter((r) => r.weightKg != null && r.weightKg > 0);
  const weightAvgLb =
    weightRows30.length > 0
      ? kgToLb(weightRows30.reduce((a, r) => a + (r.weightKg ?? 0), 0) / weightRows30.length)
      : null;

  const wRec = whoopWeek.filter((r) => r.recoveryScore != null);
  const whoopAvgRecovery =
    wRec.length > 0
      ? Math.round(wRec.reduce((a, r) => a + (r.recoveryScore ?? 0), 0) / wRec.length)
      : null;
  const wStr = whoopWeek.filter((r) => r.strain != null);
  const whoopAvgStrain =
    wStr.length > 0 ? wStr.reduce((a, r) => a + (r.strain ?? 0), 0) / wStr.length : null;
  const wHrv = whoopWeek.filter((r) => r.hrvRmssdMs != null && r.hrvRmssdMs > 0);
  const whoopAvgHrv =
    wHrv.length > 0 ? wHrv.reduce((a, r) => a + (r.hrvRmssdMs ?? 0), 0) / wHrv.length : null;
  const wSleepPerf = whoopMonth.filter((r) => r.sleepPerformancePct != null);
  const whoopSleepPerfAvg =
    wSleepPerf.length > 0
      ? wSleepPerf.reduce((a, r) => a + (r.sleepPerformancePct ?? 0), 0) / wSleepPerf.length
      : null;

  const sleepByDay30Chart = new Map<string, { date: Date; minutes: number }>();
  for (const r of month) {
    if (r.sleepMinutes != null && r.sleepMinutes > 0)
      sleepByDay30Chart.set(isoDay(r.date), { date: r.date, minutes: r.sleepMinutes });
  }
  for (const r of whoopMonth) {
    if (r.sleepMinutes != null && r.sleepMinutes > 0)
      sleepByDay30Chart.set(isoDay(r.date), { date: r.date, minutes: r.sleepMinutes });
  }
  const sleepData = [...sleepByDay30Chart.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      day: v.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      hours: Number((v.minutes / 60).toFixed(1)),
    }));

  const effData = month
    .filter((r) => r.sleepEfficiency != null && r.sleepEfficiency > 0)
    .map((r) => ({
      day: r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      efficiency: r.sleepEfficiency,
    }));

  const rhrByDay30 = new Map<string, { date: Date; bpm: number }>();
  for (const r of month) {
    if (r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0)
      rhrByDay30.set(isoDay(r.date), { date: r.date, bpm: r.restingHeartRateBpm });
  }
  for (const r of whoopMonth) {
    if (r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0)
      rhrByDay30.set(isoDay(r.date), { date: r.date, bpm: r.restingHeartRateBpm });
  }
  const rhrData = [...rhrByDay30.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      day: v.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      bpm: v.bpm,
    }));

  const weightData = whoopMonth
    .filter((r) => r.weightKg != null && r.weightKg > 0)
    .map((r) => ({
      day: r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      lb: Number(kgToLb(r.weightKg!).toFixed(1)),
    }));

  const effMin =
    effData.length > 0 ? Math.min(...effData.map((d) => d.efficiency ?? 100)) : 0;

  const whoopRecStrainData = whoopMonth
    .filter((r) => r.recoveryScore != null || r.strain != null)
    .map((r) => ({
      day: shortDay(r.date),
      recovery: r.recoveryScore,
      strain: r.strain != null ? Number(r.strain.toFixed(1)) : null,
    }));

  const whoopHrvData = whoopMonth
    .filter((r) => r.hrvRmssdMs != null && r.hrvRmssdMs > 0)
    .map((r) => ({
      day: shortDay(r.date),
      hrv: Math.round(r.hrvRmssdMs ?? 0),
    }));

  const whoopSleepPerfData = whoopMonth
    .filter((r) => r.sleepPerformancePct != null)
    .map((r) => ({
      day: shortDay(r.date),
      perf: Number((r.sleepPerformancePct ?? 0).toFixed(0)),
    }));

  const whoopSleepEffData = whoopMonth
    .filter((r) => r.sleepEfficiencyPct != null)
    .map((r) => ({
      day: shortDay(r.date),
      eff: Number((r.sleepEfficiencyPct ?? 0).toFixed(0)),
    }));

  const whoopSleepHoursData = whoopMonth
    .filter((r) => r.sleepMinutes != null && r.sleepMinutes > 0)
    .map((r) => ({
      day: shortDay(r.date),
      hours: Number(((r.sleepMinutes ?? 0) / 60).toFixed(1)),
    }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Health</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Recovery</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-600">
          WHOOP recovery, strain, HRV, and body weight (from WHOOP body measurement API when synced). Sleep averages use
          a 30-day window merging WHOOP with historical Fitbit. Step counts are not available from WHOOP.
        </p>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium tracking-wider text-stone-500 uppercase">WHOOP</p>
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <StatCard title="Recovery" value={whoopAvgRecovery != null ? `${whoopAvgRecovery}%` : "—"} hint="7-day avg" />
          <StatCard title="Strain" value={whoopAvgStrain != null ? whoopAvgStrain.toFixed(1) : "—"} hint="7-day avg" />
          <StatCard title="HRV" value={whoopAvgHrv != null ? `${Math.round(whoopAvgHrv)} ms` : "—"} hint="7-day RMSSD" />
          <StatCard
            title="Sleep performance"
            value={whoopSleepPerfAvg != null ? `${Math.round(whoopSleepPerfAvg)}%` : "—"}
            hint="WHOOP · 30-day avg"
          />
          <StatCard title="Sleep avg" value={minutesToHhMm(sleepAvgMin)} hint="WHOOP + Fitbit · 30d" />
        </section>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium tracking-wider text-stone-500 uppercase">Body &amp; heart rate</p>
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Resting HR" value={rhrAvg != null ? `${rhrAvg} bpm` : "—"} hint="WHOOP + Fitbit · 7d avg" />
          <StatCard title="Sleep efficiency" value={sleepEffAvg != null ? `${sleepEffAvg}%` : "—"} hint="Fitbit · 30d" />
          <StatCard
            title="Weight (30d avg)"
            value={weightAvgLb != null ? `${weightAvgLb.toFixed(1)} lb` : "—"}
            hint="WHOOP body measurement · sync to refresh"
          />
        </section>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium tracking-wider text-stone-500 uppercase">WHOOP · charts</p>
        <section className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Recovery vs strain" description="Last 30 days">
            <MultiLineChartView
              data={whoopRecStrainData}
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
          <ChartCard title="HRV (RMSSD)" description="Heart rate variability · last 30 days">
            <AreaChartView
              data={whoopHrvData}
              xKey="day"
              yKey="hrv"
              color="#22c55e"
              yUnit=" ms"
              gradientId="rec-hrv"
              height={240}
              yDomain={["dataMin", "dataMax"]}
            />
          </ChartCard>
          <ChartCard title="Sleep performance %" description="WHOOP sleep score · last 30 days">
            <AreaChartView
              data={whoopSleepPerfData}
              xKey="day"
              yKey="perf"
              color={chartPalette.un}
              yUnit="%"
              gradientId="rec-sp"
              height={220}
              yDomain={[0, 100]}
            />
          </ChartCard>
          <ChartCard title="Sleep efficiency %" description="WHOOP · last 30 days">
            <AreaChartView
              data={whoopSleepEffData}
              xKey="day"
              yKey="eff"
              color={chartPalette.cal}
              yUnit="%"
              gradientId="rec-se"
              height={220}
              yDomain={[0, 100]}
            />
          </ChartCard>
          <ChartCard title="Time in bed" description="WHOOP main sleep duration · last 30 days" className="lg:col-span-2">
            <AreaChartView
              data={whoopSleepHoursData}
              xKey="day"
              yKey="hours"
              color={chartPalette.gia}
              yUnit=" h"
              gradientId="rec-slph"
              height={200}
              yDomain={["dataMin", "dataMax"]}
            />
          </ChartCard>
        </section>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium tracking-wider text-stone-500 uppercase">Sleep &amp; heart rate · merged</p>
        <section className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Sleep duration" description="WHOOP + Fitbit · hours per night · last 30 days">
            <AreaChartView data={sleepData} xKey="day" yKey="hours" color={chartPalette.un} yUnit=" h" gradientId="sleep-rec" />
          </ChartCard>
          <ChartCard title="Sleep efficiency" description="Fitbit restfulness (historical) · last 30 days">
            <AreaChartView
              data={effData}
              xKey="day"
              yKey="efficiency"
              color={chartPalette.adobe}
              yUnit="%"
              gradientId="eff"
              yDomain={effData.length > 0 ? [Math.max(0, effMin - 5), 100] : [0, 100]}
            />
          </ChartCard>
        </section>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium tracking-wider text-stone-500 uppercase">Resting heart rate</p>
        <section className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Resting heart rate" description="WHOOP + Fitbit · 30-day trend" className="lg:col-span-2">
            <AreaChartView
              data={rhrData}
              xKey="day"
              yKey="bpm"
              color={chartPalette.gia}
              gradientId="rhr-rec"
              yDomain={["dataMin", "dataMax"]}
            />
          </ChartCard>
        </section>
      </div>

      <section>
        <ChartCard title="Body weight" description="WHOOP (lb) · last 30 days · from body measurement API">
          <AreaChartView
            data={weightData}
            xKey="day"
            yKey="lb"
            color={chartPalette.gia}
            yUnit=" lb"
            gradientId="wt-rec"
            height={180}
            yDomain={["dataMin", "dataMax"]}
          />
        </ChartCard>
      </section>
    </div>
  );
}
