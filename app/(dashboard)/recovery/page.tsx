import { ChartCard } from "@/components/dashboard/chart-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { AreaChartView } from "@/components/charts/area-chart";
import { BarChartView } from "@/components/charts/bar-chart";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { chartPalette } from "@/lib/chart-palette";
import { kgToLb, minutesToHhMm } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function RecoveryPage() {
  const userId = await requireUserId();
  const now = new Date();
  const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [week, month] = await Promise.all([
    prisma().dailyFitbitStat.findMany({
      where: { userId, date: { gte: start7 } },
      select: {
        date: true,
        sleepMinutes: true,
        sleepEfficiency: true,
        restingHeartRateBpm: true,
        activeMinutes: true,
        steps: true,
        weightKg: true,
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
        activeMinutes: true,
        weightKg: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  // Stat card aggregates
  const sleepRows = week.filter((r) => r.sleepMinutes != null && r.sleepMinutes > 0);
  const sleepAvgMin = sleepRows.length > 0
    ? Math.round(sleepRows.reduce((a, r) => a + (r.sleepMinutes ?? 0), 0) / sleepRows.length)
    : null;
  const effRows = week.filter((r) => r.sleepEfficiency != null && r.sleepEfficiency > 0);
  const sleepEffAvg = effRows.length > 0
    ? Math.round(effRows.reduce((a, r) => a + (r.sleepEfficiency ?? 0), 0) / effRows.length)
    : null;
  const rhrRows = week.filter((r) => r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0);
  const rhrAvg = rhrRows.length > 0
    ? Math.round(rhrRows.reduce((a, r) => a + (r.restingHeartRateBpm ?? 0), 0) / rhrRows.length)
    : null;
  const activeRows = week.filter((r) => r.activeMinutes != null && r.activeMinutes > 0);
  const activeAvg = activeRows.length > 0
    ? Math.round(activeRows.reduce((a, r) => a + (r.activeMinutes ?? 0), 0) / activeRows.length)
    : null;
  const weightRows = week.filter((r) => r.weightKg != null && r.weightKg > 0);
  const weightAvgLb =
    weightRows.length > 0
      ? kgToLb(
          weightRows.reduce((a, r) => a + (r.weightKg ?? 0), 0) /
            weightRows.length,
        )
      : null;

  // Chart: sleep duration by night (30d)
  const sleepData = month
    .filter((r) => r.sleepMinutes != null && r.sleepMinutes > 0)
    .map((r) => ({
      day: r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      hours: Number(((r.sleepMinutes ?? 0) / 60).toFixed(1)),
    }));

  // Chart: sleep efficiency by night (30d)
  const effData = month
    .filter((r) => r.sleepEfficiency != null && r.sleepEfficiency > 0)
    .map((r) => ({
      day: r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      efficiency: r.sleepEfficiency,
    }));

  // Chart: RHR trend (30d)
  const rhrData = month
    .filter((r) => r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0)
    .map((r) => ({
      day: r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      bpm: r.restingHeartRateBpm,
    }));

  // Chart: active minutes (7d bar)
  const activeData = week.map((r) => ({
    day: r.date.toLocaleDateString("en-US", { weekday: "short" }),
    min: r.activeMinutes ?? 0,
  }));

  // Chart: steps per day (7d)
  const stepsData = week.map((r) => ({
    day: r.date.toLocaleDateString("en-US", { weekday: "short" }),
    steps: r.steps ?? 0,
  }));

  const weightData = month
    .filter((r) => r.weightKg != null && r.weightKg > 0)
    .map((r) => ({
      day: r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      lb: Number(kgToLb(r.weightKg!).toFixed(1)),
    }));

  const effMin =
    effData.length > 0
      ? Math.min(...effData.map((d) => d.efficiency ?? 100))
      : 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Health</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Recovery</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-600">
          Sleep, heart rate, and activity data from Fitbit.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Sleep avg" value={minutesToHhMm(sleepAvgMin)} hint="Last 7 nights" />
        <StatCard title="Sleep efficiency" value={sleepEffAvg != null ? `${sleepEffAvg}%` : "—"} hint="Nightly average" />
        <StatCard title="Resting HR" value={rhrAvg != null ? `${rhrAvg} bpm` : "—"} hint="7-day avg" />
        <StatCard title="Active min" value={activeAvg != null ? `${activeAvg} min` : "—"} hint="Daily avg (7d)" />
        <StatCard
          title="Weight (7d avg)"
          value={weightAvgLb != null ? `${weightAvgLb.toFixed(1)} lb` : "—"}
          hint="Fitbit scale — add weight scope + sync"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Sleep duration" description="Hours per night · last 30 days">
          <AreaChartView data={sleepData} xKey="day" yKey="hours" color={chartPalette.un} yUnit=" h" gradientId="sleep-rec" />
        </ChartCard>
        <ChartCard title="Sleep efficiency" description="Restfulness signal · last 30 days">
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

      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Resting heart rate" description="30-day trend" className="lg:col-span-2">
          <AreaChartView
            data={rhrData}
            xKey="day"
            yKey="bpm"
            color={chartPalette.gia}
            gradientId="rhr-rec"
            yDomain={["dataMin", "dataMax"]}
          />
        </ChartCard>
        <ChartCard title="Active minutes" description="Daily active minutes (7d)">
          <BarChartView data={activeData} xKey="day" yKey="min" color={chartPalette.cal} yUnit=" min" />
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Steps this week" description="Daily step count">
          <BarChartView data={stepsData} xKey="day" yKey="steps" color={chartPalette.amazon} height={180} />
        </ChartCard>
        <ChartCard title="Body weight" description="Fitbit logs (lb) · last 30 days">
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
