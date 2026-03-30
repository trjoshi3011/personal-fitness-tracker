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

  const whoopRecovery = snapshots
    .filter((s) => s.avgWhoopRecovery != null && (s.whoopDaysCount ?? 0) > 0)
    .map((s) => ({
      period: ymLabel(s.year, s.month),
      recovery: Math.round(s.avgWhoopRecovery!),
    }));

  const whoopHrv = snapshots
    .filter((s) => s.avgWhoopHrvMs != null && (s.whoopDaysCount ?? 0) > 0)
    .map((s) => ({
      period: ymLabel(s.year, s.month),
      hrv: Math.round(s.avgWhoopHrvMs!),
    }));

  const whoopRecStrainDual = snapshots
    .filter((s) => (s.whoopDaysCount ?? 0) > 0 && (s.avgWhoopRecovery != null || s.avgWhoopStrain != null))
    .map((s) => ({
      period: ymLabel(s.year, s.month),
      recovery: s.avgWhoopRecovery != null ? Math.round(s.avgWhoopRecovery) : null,
      strain: s.avgWhoopStrain != null ? Number(s.avgWhoopStrain.toFixed(1)) : null,
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

  const latestWhoop = [...snapshots]
    .reverse()
    .find((s) => (s.whoopDaysCount ?? 0) > 0 && s.avgWhoopRecovery != null);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Long-term</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Journey</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-stone-600">
          Month-by-month rollups: running volume from Strava and Fitbit exercise logs; sleep, steps, and weight from
          Fitbit; recovery, strain, and HRV from WHOOP. Snapshots refresh after each sync (Strava, Fitbit, or WHOOP).
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
          hint="Strava + Fitbit · monthly weighted"
        />
        <StatCard
          title="Latest sleep avg"
          value={
            latest?.avgSleepMinutes != null && latest.avgSleepMinutes > 0
              ? `${(latest.avgSleepMinutes / 60).toFixed(1)} h/night`
              : "—"
          }
          hint="Fitbit nights in month"
        />
        <StatCard
          title="Latest WHOOP recovery"
          value={
            latestWhoop?.avgWhoopRecovery != null
              ? `${Math.round(latestWhoop.avgWhoopRecovery)}%`
              : "—"
          }
          hint={latestWhoop ? ymLabel(latestWhoop.year, latestWhoop.month) : "Connect WHOOP + sync"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Monthly run volume"
          description="Strava runs + Fitbit logged runs · miles per calendar month"
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
          description="Strava + Fitbit · lower is faster"
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
          description="Fitbit · hours per night averaged by month"
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
          description="Fitbit scale · lb"
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

      {whoopRecStrainDual.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="WHOOP recovery vs strain"
            description="Monthly averages · days with WHOOP data in that month"
            className="lg:col-span-2"
          >
            <MultiLineChartView
              data={whoopRecStrainDual}
              xKey="period"
              lines={[
                { dataKey: "recovery", color: "#22c55e", name: "Recovery %", yAxisId: "left" },
                { dataKey: "strain", color: chartPalette.adobe, name: "Strain", yAxisId: "right" },
              ]}
              yDomain={[0, 100]}
              rightYDomain={[0, "dataMax"]}
              height={260}
            />
          </ChartCard>
          <ChartCard title="WHOOP recovery %" description="Monthly average">
            <AreaChartView
              data={whoopRecovery}
              xKey="period"
              yKey="recovery"
              color="#22c55e"
              yUnit="%"
              gradientId="j-wrec"
              height={240}
              yDomain={[0, 100]}
            />
          </ChartCard>
          <ChartCard title="WHOOP HRV" description="Monthly avg RMSSD (ms)">
            <AreaChartView
              data={whoopHrv}
              xKey="period"
              yKey="hrv"
              color="#22c55e"
              yUnit=" ms"
              gradientId="j-whrv"
              height={240}
              yDomain={["dataMin", "dataMax"]}
            />
          </ChartCard>
        </section>
      )}

      <section>
        <ChartCard
          title="Year-over-year run volume"
          description={`Strava + Fitbit · ${lastYear} vs ${thisYear} (same calendar month)`}
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
