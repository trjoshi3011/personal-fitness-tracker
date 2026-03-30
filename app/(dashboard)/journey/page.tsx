import { ChartCard } from "@/components/dashboard/chart-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { BarChartView } from "@/components/charts/bar-chart";
import { AreaChartView } from "@/components/charts/area-chart";
import { MultiLineChartView } from "@/components/charts/multi-line-chart";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { chartPalette } from "@/lib/chart-palette";
import { formatPaceMinPerMile, kgToLb, metersToMiles } from "@/lib/units";

export const dynamic = "force-dynamic";

function ymLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

export default async function JourneyPage() {
  const userId = await requireUserId();
  const snapshots = await prisma().monthlyFitnessSnapshot.findMany({
    where: { userId },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  const now = new Date();
  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;

  const runMi = snapshots
    .filter((s) => (s.runDistanceMeters ?? 0) > 0)
    .map((s) => ({
      period: ymLabel(s.year, s.month),
      mi: Number(metersToMiles(s.runDistanceMeters ?? 0).toFixed(1)),
    }));

  const paceMin = snapshots
    .filter((s) => s.avgPaceSecPerMi != null && s.avgPaceSecPerMi > 0)
    .map((s) => ({
      period: ymLabel(s.year, s.month),
      pace: Number((s.avgPaceSecPerMi! / 60).toFixed(2)),
    }));

  const sleepHrs = snapshots
    .filter((s) => s.avgSleepMinutes != null && s.avgSleepMinutes > 0)
    .map((s) => ({
      period: ymLabel(s.year, s.month),
      hours: Number((s.avgSleepMinutes! / 60).toFixed(2)),
    }));

  const weightLb = snapshots
    .filter((s) => s.avgWeightKg != null && s.avgWeightKg > 0)
    .map((s) => ({
      period: ymLabel(s.year, s.month),
      lb: Number(kgToLb(s.avgWeightKg!).toFixed(1)),
    }));

  const monthShort = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const yoyData = monthShort.map((m, i) => {
    const mo = i + 1;
    const a = snapshots.find((s) => s.year === lastYear && s.month === mo);
    const b = snapshots.find((s) => s.year === thisYear && s.month === mo);
    return {
      month: m,
      [String(lastYear)]: a?.runDistanceMeters
        ? Number(metersToMiles(a.runDistanceMeters).toFixed(1))
        : null,
      [String(thisYear)]: b?.runDistanceMeters
        ? Number(metersToMiles(b.runDistanceMeters).toFixed(1))
        : null,
    };
  });

  const first = snapshots[0];
  const latest = snapshots[snapshots.length - 1];
  const monthsTracked = snapshots.length;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Long-term</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Journey</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-stone-600">
          Month-by-month rollups combine Strava runs and Fitbit logged runs (same window as Fitbit
          sync). Run a{" "}
          <span className="font-medium text-stone-800">deep sync</span> in Settings to backfill Strava
          (years) and Fitbit daily + exercise history (last ~6 months).
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Months tracked"
          value={monthsTracked > 0 ? String(monthsTracked) : "—"}
          hint="Snapshot rows in DB"
        />
        <StatCard
          title="Earliest month"
          value={first ? ymLabel(first.year, first.month) : "—"}
          hint="First rollup period"
        />
        <StatCard
          title="Latest pace (runs)"
          value={
            latest?.avgPaceSecPerMi != null && latest.avgPaceSecPerMi > 0
              ? formatPaceMinPerMile(latest.avgPaceSecPerMi)
              : "—"
          }
          hint="Monthly weighted avg"
        />
        <StatCard
          title="Latest sleep avg"
          value={
            latest?.avgSleepMinutes != null && latest.avgSleepMinutes > 0
              ? `${(latest.avgSleepMinutes / 60).toFixed(1)} h/night`
              : "—"
          }
          hint="Nights with Fitbit data"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Monthly run volume"
          description="Total Strava run distance per calendar month"
        >
          <BarChartView
            data={runMi}
            xKey="period"
            yKey="mi"
            color={chartPalette.amazon}
            yUnit=" mi"
            height={260}
          />
        </ChartCard>
        <ChartCard
          title="Average pace by month"
          description="Lower is faster (weighted by distance)"
        >
          <AreaChartView
            data={paceMin}
            xKey="period"
            yKey="pace"
            color={chartPalette.cal}
            yUnit=" min/mi"
            gradientId="j-pace"
            height={260}
            yDomain={["dataMin", "dataMax"]}
          />
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Sleep (monthly average)"
          description="Fitbit nights averaged per month"
        >
          <AreaChartView
            data={sleepHrs}
            xKey="period"
            yKey="hours"
            color={chartPalette.un}
            yUnit=" h"
            gradientId="j-sleep"
            height={260}
          />
        </ChartCard>
        <ChartCard
          title="Body weight (monthly average)"
          description="From Fitbit scale logs (lb) — add weight scope + sync"
        >
          <AreaChartView
            data={weightLb}
            xKey="period"
            yKey="lb"
            color={chartPalette.gia}
            yUnit=" lb"
            gradientId="j-wt"
            height={260}
            yDomain={["dataMin", "dataMax"]}
          />
        </ChartCard>
      </section>

      <section>
        <ChartCard
          title="Year-over-year run volume"
          description={`${lastYear} vs ${thisYear} — same calendar month`}
        >
          <MultiLineChartView
            data={yoyData}
            xKey="month"
            lines={[
              {
                dataKey: String(lastYear),
                color: chartPalette.un,
                name: `${lastYear} (mi)`,
              },
              {
                dataKey: String(thisYear),
                color: chartPalette.amazon,
                name: `${thisYear} (mi)`,
              },
            ]}
            height={280}
            yDomain={[0, "dataMax"]}
          />
        </ChartCard>
      </section>
    </div>
  );
}
