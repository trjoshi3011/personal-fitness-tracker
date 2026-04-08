import { ChartCard } from "@/components/dashboard/chart-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { ActivityMonthCalendar } from "@/components/dashboard/activity-month-calendar";
import type { LiftDayBucket } from "@/components/dashboard/lifting-type-month-calendar";
import { LiftingTypeMonthCalendar } from "@/components/dashboard/lifting-type-month-calendar";
import { LiftWeeklyPlanClient } from "@/components/dashboard/lift-weekly-plan-client";
import { WhoopLiftTypeSelect } from "@/components/dashboard/whoop-lift-type-select";
import { BarChartView } from "@/components/charts/bar-chart";
import { MultiLineChartView } from "@/components/charts/multi-line-chart";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { chartPalette } from "@/lib/chart-palette";
import {
  emptyTemplateCounts,
  LIFT_TEMPLATE_KEYS,
  LIFT_TEMPLATE_LABELS,
  targetsToRecord,
  weekConsistencyScore,
} from "@/lib/lift-session-log";
import { fetchWhoopLiftingWorkoutsInRange } from "@/lib/whoop-lifting-queries";
import { WHOOP_LIFTING_SPORT_NAMES } from "@/lib/whoop-lifting-sports";
import {
  activeZonedDaysOfMonth,
  localCalendarParts,
  parseCalendarYearMonth,
  startOfZonedWeekMondayContaining,
  zonedMonthRangeUtc,
} from "@/lib/zoned-calendar";
import { secondsToHhMm } from "@/lib/units";
export const dynamic = "force-dynamic";

function shortDay(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSportLabel(s: string) {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function zoneHighMinutes(zoneDurations: unknown): string {
  if (!zoneDurations || typeof zoneDurations !== "object") return "—";
  const o = zoneDurations as Record<string, number>;
  const z4 = o.zone_four_milli ?? 0;
  const z5 = o.zone_five_milli ?? 0;
  const ms = z4 + z5;
  if (ms <= 0) return "—";
  return `${Math.round(ms / 60_000)}m Z4–5`;
}

export default async function LiftingPage({
  searchParams,
}: {
  searchParams?: Promise<{ y?: string; m?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const userId = await requireUserId();
  const now = new Date();
  const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const user = await prisma().user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone?.trim() || "UTC";
  const cal = parseCalendarYearMonth(sp, tz);
  const monthRange = zonedMonthRangeUtc(cal.year, cal.month1, tz);

  const [
    lift7,
    lift30,
    liftMonth,
    whoop7,
    whoop30,
    liftSplitTargets,
  ] = await Promise.all([
    fetchWhoopLiftingWorkoutsInRange(userId, start7, now),
    fetchWhoopLiftingWorkoutsInRange(userId, start30, now),
    fetchWhoopLiftingWorkoutsInRange(userId, monthRange.start, monthRange.end),
    prisma().dailyWhoopStat.findMany({
      where: { userId, date: { gte: start7 } },
      select: { recoveryScore: true, strain: true, hrvRmssdMs: true },
    }),
    prisma().dailyWhoopStat.findMany({
      where: { userId, date: { gte: start30 } },
      select: { date: true, recoveryScore: true, strain: true },
      orderBy: { date: "asc" },
    }),
    prisma().liftSplitWeeklyTarget.findUnique({ where: { userId } }),
  ]);

  const weeklyTargets = liftSplitTargets
    ? targetsToRecord({
        pushTarget: liftSplitTargets.pushTarget,
        pullTarget: liftSplitTargets.pullTarget,
        legsTarget: liftSplitTargets.legsTarget,
      })
    : emptyTemplateCounts();

  const thisMonday = startOfZonedWeekMondayContaining(now, tz);
  const thisMondayMs = thisMonday.getTime();
  const thisWeekCounts = emptyTemplateCounts();
  for (const w of lift30) {
    if (w.liftSessionTemplate == null) continue;
    if (startOfZonedWeekMondayContaining(w.startAt, tz).getTime() !== thisMondayMs) {
      continue;
    }
    thisWeekCounts[w.liftSessionTemplate] += 1;
  }

  const consistencyThisWeek = weekConsistencyScore(
    thisWeekCounts,
    weeklyTargets,
  );

  const initialTargets = liftSplitTargets
    ? {
        pushTarget: liftSplitTargets.pushTarget,
        pullTarget: liftSplitTargets.pullTarget,
        legsTarget: liftSplitTargets.legsTarget,
      }
    : {
        pushTarget: 0,
        pullTarget: 0,
        legsTarget: 0,
      };

  const liftTypeDayMap = new Map<number, LiftDayBucket>();
  for (const w of liftMonth) {
    const p = localCalendarParts(w.startAt, tz);
    if (p.y !== cal.year || p.m !== cal.month1) continue;
    const dom = p.d;
    const cur = liftTypeDayMap.get(dom) ?? { templates: [], untaggedLiftCount: 0 };
    if (w.liftSessionTemplate) {
      cur.templates.push(w.liftSessionTemplate);
    } else {
      cur.untaggedLiftCount += 1;
    }
    liftTypeDayMap.set(dom, cur);
  }

  const activeLiftDays = activeZonedDaysOfMonth(
    liftMonth.map((w) => w.startAt),
    tz,
    cal.year,
    cal.month1,
  );

  const sessionCount = lift7.length;
  const totalSec = lift7.reduce(
    (acc, w) => acc + (w.endAt.getTime() - w.startAt.getTime()) / 1000,
    0,
  );
  const scored = lift7.filter((w) => w.scoreState === "SCORED" && w.strain != null);
  const avgStrain =
    scored.length > 0
      ? scored.reduce((a, w) => a + (w.strain ?? 0), 0) / scored.length
      : null;
  const hrRows = lift7.filter((w) => w.averageHeartRateBpm != null);
  const avgHr =
    hrRows.length > 0
      ? Math.round(
          hrRows.reduce((a, w) => a + (w.averageHeartRateBpm ?? 0), 0) /
            hrRows.length,
        )
      : null;

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

  const strainTrend = [...lift30]
    .reverse()
    .filter((w) => w.strain != null)
    .map((w) => ({
      date: shortDay(w.startAt),
      strain: Number((w.strain ?? 0).toFixed(2)),
    }));

  const hrTrend = [...lift30]
    .reverse()
    .filter((w) => w.averageHeartRateBpm != null)
    .map((w) => ({
      date: shortDay(w.startAt),
      avg: w.averageHeartRateBpm,
      max: w.maxHeartRateBpm,
    }));

  const durationTrend = [...lift30]
    .reverse()
    .map((w) => {
      const sec = (w.endAt.getTime() - w.startAt.getTime()) / 1000;
      return {
        date: shortDay(w.startAt),
        min: Number((sec / 60).toFixed(1)),
      };
    });

  const tableRows = lift30.slice(0, 40);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Training</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Lifting</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-600">
          Strength sessions from WHOOP workouts (
          {WHOOP_LIFTING_SPORT_NAMES.join(", ")}). WHOOP reports workout strain, heart rate,
          energy (kJ), and time in HR zones — not individual lifts or sets. Run a WHOOP sync in
          Settings to pull workout data from the WHOOP developer workout API.           Assign each WHOOP lift a{" "}
          <span className="font-medium text-stone-800">session type</span> (push, pull, or legs) in
          the table below — it tags that workout only. The month calendar shows which day was which
          split; weekly plan consistency uses those tags.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Sessions" value={String(sessionCount)} hint="WHOOP · 7d" />
        <StatCard
          title="Time training"
          value={totalSec > 0 ? secondsToHhMm(Math.round(totalSec)) : "—"}
          hint="WHOOP · 7d"
        />
        <StatCard
          title="Avg strain"
          value={avgStrain != null ? avgStrain.toFixed(1) : "—"}
          hint="Scored workouts · 7d"
        />
        <StatCard title="Avg HR" value={avgHr != null ? `${avgHr} bpm` : "—"} hint="WHOOP · 7d" />
      </section>

      <div>
        <p className="mb-3 text-xs font-medium tracking-wider text-stone-500 uppercase">
          WHOOP · same week as your lifting
        </p>
        <section className="grid gap-4 md:grid-cols-3">
          <StatCard title="Recovery" value={whoopAvgRecovery != null ? `${whoopAvgRecovery}%` : "—"} hint="7-day avg" />
          <StatCard title="Day strain" value={whoopAvgStrain != null ? whoopAvgStrain.toFixed(1) : "—"} hint="7-day avg" />
          <StatCard title="HRV" value={whoopAvgHrv != null ? `${Math.round(whoopAvgHrv)} ms` : "—"} hint="7-day RMSSD" />
        </section>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Workout strain" description="Per session · last 30d · lower = easier" className="lg:col-span-2">
          <BarChartView
            data={strainTrend}
            xKey="date"
            yKey="strain"
            color={chartPalette.cal}
            yUnit=""
          />
        </ChartCard>
        <ActivityMonthCalendar
          basePath="/lifting"
          year={cal.year}
          month1={cal.month1}
          timeZone={tz}
          activeDays={activeLiftDays}
          legendLabel="lift"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Session duration" description="Minutes · WHOOP start→end">
          <BarChartView data={durationTrend} xKey="date" yKey="min" color={chartPalette.amazon} yUnit=" min" />
        </ChartCard>
        <ChartCard title="Workout heart rate" description="Avg and max per session · last 30d">
          <MultiLineChartView
            data={hrTrend}
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
          title="WHOOP recovery vs day strain"
          description="Daily readiness vs load · last 30 days (not per-workout)"
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

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-stretch">
        <ChartCard
          title="Lift types · month"
          description="WHOOP strength workouts by day — cell color shows push, pull, or legs (stone = not set yet)"
          className="flex min-h-0 flex-col lg:col-span-2 lg:h-full"
          contentClassName="flex min-h-0 flex-1 flex-col pt-0"
        >
          <LiftingTypeMonthCalendar
            year={cal.year}
            month1={cal.month1}
            timeZone={tz}
            dayMap={liftTypeDayMap}
            className="flex min-h-0 w-full flex-1 flex-col"
          />
        </ChartCard>
        <div className="flex min-h-0 flex-col gap-4 lg:col-span-1 lg:min-h-0 lg:h-full">
          <StatCard
            fillHeight
            className="min-h-0 flex-1"
            title="This week vs plan"
            value={
              consistencyThisWeek != null
                ? `${Math.round(consistencyThisWeek * 100)}%`
                : "Set targets"
            }
            hint={
              consistencyThisWeek != null
                ? "Tagged push/pull/legs this week vs plan (capped at 100%)"
                : "Set weekly targets and tag workouts below"
            }
          />
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-amber-900/10 bg-card/55 p-4 text-sm shadow-sm shadow-yellow-950/[0.04]">
            <div className="shrink-0 text-[10px] font-semibold tracking-wider text-stone-500 uppercase">
              Current week counts
            </div>
            <ul className="mt-3 flex flex-1 flex-col justify-center gap-2 text-stone-700">
              {LIFT_TEMPLATE_KEYS.map((key) => {
                const t = weeklyTargets[key];
                const a = thisWeekCounts[key];
                const label = LIFT_TEMPLATE_LABELS[key];
                return (
                  <li key={key} className="flex justify-between gap-2 text-xs">
                    <span>{label}</span>
                    <span className="tabular-nums text-stone-600">
                      {a}/{t > 0 ? t : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      <ChartCard
        title="Weekly split plan"
        description="Targets per week; actuals come from session types you set on each WHOOP row"
        contentClassName="pt-0"
      >
        <LiftWeeklyPlanClient initialTargets={initialTargets} />
      </ChartCard>

      <section>
        <ChartCard
          title="Recent strength workouts"
          description="Last 40 WHOOP sessions in the last 30 days, newest first — set session type per row"
          contentClassName="pt-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="text-[10px] tracking-wider text-stone-500 uppercase">
                <tr>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-left font-medium">Start</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-left font-medium">
                    Session type
                  </th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-left font-medium">Sport</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">Duration</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-left font-medium">Score</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">Strain</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">Avg HR</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">Max HR</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">kJ</th>
                  <th className="sticky top-0 bg-card/85 px-3 py-2.5 text-right font-medium">Z4–5</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length > 0 ? (
                  tableRows.map((w) => {
                    const sec = (w.endAt.getTime() - w.startAt.getTime()) / 1000;
                    return (
                      <tr
                        key={w.id}
                        className="border-t border-amber-900/[0.06] transition-colors hover:bg-amber-50/30"
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 text-stone-500">
                          {w.startAt.toLocaleString("en-US", {
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <WhoopLiftTypeSelect
                            workoutId={w.id}
                            initial={w.liftSessionTemplate}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-md bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-stone-700 uppercase">
                            WHOOP
                          </span>
                          <div className="mt-0.5 font-medium text-stone-900">{formatSportLabel(w.sportName)}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">
                          {sec > 0 ? secondsToHhMm(Math.round(sec)) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">{w.scoreState}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">
                          {w.strain != null ? w.strain.toFixed(2) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">
                          {w.averageHeartRateBpm ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">
                          {w.maxHeartRateBpm ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">
                          {w.kilojoule != null ? Math.round(w.kilojoule) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-stone-700">
                          {zoneHighMinutes(w.zoneDurations)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-stone-500">
                      No lifting workouts in the last 30 days. Log a strength session on WHOOP (sport
                      weightlifting / powerlifting / etc.) and sync.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </section>
    </div>
  );
}
