import "server-only";
import Link from "next/link";

import { ChartCard } from "@/components/dashboard/chart-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { MultiLineChartView } from "@/components/charts/multi-line-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { chartPalette } from "@/lib/chart-palette";
import {
  formatZonedDateShort,
  formatZonedWeekdayMonthDayYear,
  zonedDayKeyFromDate,
} from "@/lib/format-zoned";
import {
  addCalendarDaysToZonedParts,
  canonicalZonedDayStart,
  localCalendarParts,
  nextZonedCalendarDayStartMs,
  startOfZonedCalendarDay,
} from "@/lib/zoned-calendar";
import {
  ageYearsAt,
  buildPerDayWeightKg,
  mifflinStJeorBmrKcal,
  type BiologicalSex,
} from "@/lib/nutrition-burn";

const WINDOW_DAYS = 60;
const RECENT_LIMIT = 25;

/**
 * Partial Apple Health syncs (and similar) often produce implausibly low daily
 * totals. We treat days at or below this intake floor as untrusted and omit
 * them from averages and charts so burn/deficit math isn’t skewed.
 */
const MIN_TRUSTED_CONSUMED_KCAL = 900;

function hasTrustedIntake(d: DayRow): boolean {
  const c = d.caloriesKcal;
  return c != null && Number.isFinite(c) && c > MIN_TRUSTED_CONSUMED_KCAL;
}

type NutritionRow = {
  id: string;
  date: Date;
  source: "BACKFILL" | "MANUAL";
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  saturatedFatG: number | null;
  activeEnergyKcal: number | null;
  notes: string | null;
};

type DayRow = NutritionRow & { dayKey: string };

function dayLabel(d: Date, tz: string) {
  return formatZonedDateShort(d, tz);
}

export async function NutritionBelowFold({
  userId,
  tz,
  todayIso,
}: {
  userId: string;
  tz: string;
  todayIso: string;
}) {
  const now = new Date();

  /**
   * 60-day rolling window aligned to user-timezone calendar days. Same trick
   * as the insights page: derive the oldest day in TZ-aware steps so DST
   * doesn't shave or pad the window.
   */
  const projectionStart = (() => {
    const tp = localCalendarParts(now, tz);
    const oldest = addCalendarDaysToZonedParts(
      tp.y,
      tp.m,
      tp.d,
      -(WINDOW_DAYS - 1),
      tz,
    );
    return startOfZonedCalendarDay(oldest.y, oldest.m, oldest.d, tz);
  })();

  const [
    profile,
    windowRows,
    recentRows,
    manualDatesOnly,
    weightWhoop,
    weightManual,
  ] = await Promise.all([
    prisma().user.findUnique({
      where: { id: userId },
      select: {
        heightCm: true,
        dateOfBirth: true,
        biologicalSex: true,
      },
    }),
    prisma().dailyNutritionLog.findMany({
      where: { userId, date: { gte: projectionStart } },
      select: {
        id: true,
        date: true,
        source: true,
        caloriesKcal: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
        fiberG: true,
        sugarG: true,
        sodiumMg: true,
        saturatedFatG: true,
        activeEnergyKcal: true,
        notes: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma().dailyNutritionLog.findMany({
      where: { userId },
      select: {
        id: true,
        date: true,
        source: true,
        caloriesKcal: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
        fiberG: true,
        sugarG: true,
        sodiumMg: true,
        saturatedFatG: true,
        activeEnergyKcal: true,
        notes: true,
      },
      orderBy: { date: "desc" },
      take: RECENT_LIMIT * 2, // headroom; we filter visually below.
    }),
    prisma().dailyNutritionLog.findMany({
      where: { userId, source: "MANUAL" },
      select: { date: true },
    }),
    prisma().dailyWhoopStat.findMany({
      where: { userId, weightKg: { not: null } },
      select: { date: true, weightKg: true },
      orderBy: { date: "asc" },
    }),
    prisma().manualWeightLog.findMany({
      where: { userId },
      select: { date: true, weightKg: true },
      orderBy: { date: "asc" },
    }),
  ]);

  /**
   * Collapse (BACKFILL, MANUAL) pairs to a single per-day row — MANUAL wins
   * when both exist (order-independent).
   */
  const winnerByDay = new Map<string, DayRow>();
  for (const r of windowRows as NutritionRow[]) {
    const dayKey = zonedDayKeyFromDate(r.date, tz);
    const existing = winnerByDay.get(dayKey);
    if (!existing) {
      winnerByDay.set(dayKey, { ...r, dayKey });
    } else if (r.source === "MANUAL") {
      winnerByDay.set(dayKey, { ...r, dayKey });
    } else if (existing.source !== "MANUAL") {
      winnerByDay.set(dayKey, { ...r, dayKey });
    }
  }
  const merged = [...winnerByDay.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  const mergedTrusted = merged.filter(hasTrustedIntake);
  const trustedHint = `Days with consumed > ${MIN_TRUSTED_CONSUMED_KCAL} kcal · last ${WINDOW_DAYS}d`;

  /** Average over trusted-intake days where the metric was recorded (skip nulls). */
  const avg = (key: keyof NutritionRow & string) => {
    let sum = 0;
    let n = 0;
    for (const d of mergedTrusted) {
      const v = d[key] as number | null;
      if (v != null && Number.isFinite(v) && v > 0) {
        sum += v;
        n += 1;
      }
    }
    return n > 0 ? sum / n : null;
  };

  const avgCalories = avg("caloriesKcal");
  const avgProtein = avg("proteinG");
  const avgCarbs = avg("carbsG");
  const avgFat = avg("fatG");

  /**
   * Active energy (kcal burned outside of resting metabolism) is only ever
   * stored on BACKFILL rows. The MANUAL-wins merge would silently drop
   * Apple-Health activity data on days the user also logged calories
   * manually, so we read activeEnergy independently per day from any row
   * that has it.
   */
  const activeByDay = new Map<string, number>();
  for (const r of windowRows as NutritionRow[]) {
    if (r.activeEnergyKcal != null && r.activeEnergyKcal > 0) {
      activeByDay.set(zonedDayKeyFromDate(r.date, tz), r.activeEnergyKcal);
    }
  }

  /**
   * BMR via Mifflin–St Jeor. Needs height + DOB + sex on the user profile and
   * a per-day weight (forward-filled from WHOOP + manual scale logs). When any
   * input is missing we surface a "set up your profile" empty state instead of
   * fabricating numbers.
   */
  const heightCm = profile?.heightCm ?? null;
  const dob = profile?.dateOfBirth ?? null;
  const sex: BiologicalSex | null =
    profile?.biologicalSex === "MALE" ||
    profile?.biologicalSex === "FEMALE" ||
    profile?.biologicalSex === "OTHER"
      ? (profile.biologicalSex as BiologicalSex)
      : null;

  /** First/last day of the rolling window in user-tz midnight ms (chart axis). */
  const windowStartMs = projectionStart.getTime();
  const todayStartMs = startOfZonedCalendarDay(
    localCalendarParts(now, tz).y,
    localCalendarParts(now, tz).m,
    localCalendarParts(now, tz).d,
    tz,
  ).getTime();

  /** Same per-day forward-fill the insights page uses for weight projection. */
  const weightHistory: { date: Date; weightKg: number }[] = [];
  for (const w of weightWhoop) {
    if (w.weightKg != null) {
      weightHistory.push({ date: w.date, weightKg: w.weightKg });
    }
  }
  for (const w of weightManual) {
    weightHistory.push({ date: w.date, weightKg: w.weightKg });
  }
  weightHistory.sort((a, b) => a.date.getTime() - b.date.getTime());

  const weightByDayMs = buildPerDayWeightKg({
    history: weightHistory,
    startDayMs: windowStartMs,
    endDayMs: todayStartMs,
    dayStartMs: (d) => canonicalZonedDayStart(d, tz).getTime(),
    advanceCalendarDayMs: (ms) => nextZonedCalendarDayStartMs(ms, tz),
  });

  const hasProfile = heightCm != null && dob != null && sex != null;
  const hasWeight = weightByDayMs.size > 0;
  const burnReady = hasProfile && hasWeight;

  /**
   * Per-day energy series. We compute BMR each day so it tracks weight (a
   * 5-pound swing moves BMR by ~25kcal — small but visible on a deficit
   * chart). Total burn = BMR + active energy that day.
   */
  type EnergyPoint = {
    day: string;
    consumedKcal: number | null;
    activeKcal: number | null;
    bmrKcal: number | null;
    totalBurnKcal: number | null;
    deficitKcal: number | null;
  };
  const energySeries: EnergyPoint[] = [];
  for (const d of mergedTrusted) {
    const dayMs = canonicalZonedDayStart(d.date, tz).getTime();
    const dayKey = zonedDayKeyFromDate(d.date, tz);
    const weight = weightByDayMs.get(dayMs) ?? null;
    const ageY = dob ? ageYearsAt(dob, d.date) : null;
    const bmr =
      hasProfile && weight != null && ageY != null
        ? mifflinStJeorBmrKcal({
            weightKg: weight,
            heightCm: heightCm!,
            ageYears: ageY,
            sex: sex!,
          })
        : null;
    const active = activeByDay.get(dayKey) ?? null;
    const totalBurn =
      bmr != null ? bmr + (active ?? 0) : active != null ? active : null;
    const consumed = d.caloriesKcal;
    const deficit =
      consumed != null && totalBurn != null ? consumed - totalBurn : null;

    energySeries.push({
      day: dayLabel(d.date, tz),
      consumedKcal: consumed != null ? Math.round(consumed) : null,
      activeKcal: active != null ? Math.round(active) : null,
      bmrKcal: bmr != null ? Math.round(bmr) : null,
      totalBurnKcal: totalBurn != null ? Math.round(totalBurn) : null,
      deficitKcal: deficit != null ? Math.round(deficit) : null,
    });
  }

  /** Averages for the new burn / deficit stat cards. */
  const avgFromSeries = (key: keyof EnergyPoint) => {
    let sum = 0;
    let n = 0;
    for (const p of energySeries) {
      const v = p[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        n += 1;
      }
    }
    return n > 0 ? sum / n : null;
  };
  const avgBurn = avgFromSeries("totalBurnKcal");
  const avgDeficit = avgFromSeries("deficitKcal");
  const avgActive = avgFromSeries("activeKcal");

  const macrosData = mergedTrusted.map((d) => ({
    day: dayLabel(d.date, tz),
    protein: d.proteinG != null ? Math.round(d.proteinG) : null,
    carbs: d.carbsG != null ? Math.round(d.carbsG) : null,
    fat: d.fatG != null ? Math.round(d.fatG) : null,
  }));

  /**
   * For the recent table, BACKFILL rows are tagged shadowed when any MANUAL
   * row exists on that calendar day (manual wins on charts). Uses all manual
   * rows — not just the recent slice — so older backfill rows badge correctly.
   */
  const manualDays = new Set(
    manualDatesOnly.map((r) => zonedDayKeyFromDate(r.date, tz)),
  );
  const recent = (recentRows as NutritionRow[])
    .map((r) => ({
      ...r,
      dayKey: zonedDayKeyFromDate(r.date, tz),
      shadowed: r.source === "BACKFILL" && manualDays.has(zonedDayKeyFromDate(r.date, tz)),
    }))
    .slice(0, RECENT_LIMIT);

  const backfillCount = recentRows.filter((r) => r.source === "BACKFILL").length;
  const manualCount = recentRows.filter((r) => r.source === "MANUAL").length;

  const weightDayLong = (d: Date) =>
    formatZonedWeekdayMonthDayYear(canonicalZonedDayStart(d, tz), tz);

  const deficitDescription = burnReady
    ? `Mifflin–St Jeor BMR (height ${heightCm!.toFixed(0)} cm, sex ${sex}) + Apple Health active energy. Negative bars = deficit, positive = surplus.`
    : "Add height, DOB and biological sex (or upload Apple Health to auto-fill) to compute BMR and per-day burn.";

  return (
    <>
      <ProfileCard
        profile={{
          heightCm,
          dateOfBirth: dob,
          biologicalSex: sex,
        }}
        burnReady={burnReady}
        hasWeight={hasWeight}
      />

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Calories (avg)"
          value={avgCalories != null ? `${Math.round(avgCalories)} kcal` : "—"}
          hint={trustedHint}
        />
        <StatCard
          title="Calories burned (avg)"
          value={avgBurn != null ? `${Math.round(avgBurn)} kcal` : "—"}
          hint={
            burnReady
              ? `BMR + active · ${trustedHint}${avgActive != null ? ` · active ${Math.round(avgActive)}/day` : ""}`
              : "Profile incomplete"
          }
        />
        <StatCard
          title="Deficit (avg)"
          value={
            avgDeficit != null
              ? `${avgDeficit >= 0 ? "+" : ""}${Math.round(avgDeficit)} kcal`
              : "—"
          }
          hint={
            avgDeficit != null
              ? avgDeficit < 0
                ? `In a calorie deficit · ${trustedHint}`
                : `In a calorie surplus · ${trustedHint}`
              : "Need consumed + burn on trusted intake days"
          }
        />
        <StatCard
          title="Protein (avg)"
          value={avgProtein != null ? `${Math.round(avgProtein)} g` : "—"}
          hint={trustedHint}
        />
        <StatCard
          title="Carbs (avg)"
          value={avgCarbs != null ? `${Math.round(avgCarbs)} g` : "—"}
          hint={trustedHint}
        />
        <StatCard
          title="Fat (avg)"
          value={avgFat != null ? `${Math.round(avgFat)} g` : "—"}
          hint={trustedHint}
        />
      </section>

      <section>
        <ChartCard
          title="Calories in vs out"
          description={`Consumed vs total burn (BMR + active) · ${trustedHint} · ${backfillCount} backfill / ${manualCount} manual`}
        >
          <MultiLineChartView
            data={energySeries}
            xKey="day"
            lines={[
              {
                dataKey: "consumedKcal",
                color: chartPalette.amazon,
                name: "Consumed (kcal)",
                yAxisId: "left",
              },
              {
                dataKey: "totalBurnKcal",
                color: chartPalette.adobe,
                name: "Total burn (kcal)",
                yAxisId: "left",
              },
              {
                dataKey: "bmrKcal",
                color: chartPalette.un,
                name: "BMR",
                yAxisId: "left",
                strokeDasharray: "4 4",
                showDots: false,
              },
              {
                dataKey: "activeKcal",
                color: chartPalette.cal,
                name: "Active (kcal)",
                yAxisId: "left",
                strokeDasharray: "2 4",
                showDots: false,
              },
            ]}
            yDomain={[0, "dataMax"]}
            height={300}
          />
        </ChartCard>
      </section>

      <section>
        <ChartCard
          title="Daily deficit"
          description={`${deficitDescription} Charts include only ${trustedHint.toLowerCase()}.`}
        >
          <MultiLineChartView
            data={energySeries}
            xKey="day"
            lines={[
              {
                dataKey: "deficitKcal",
                color: chartPalette.gia,
                name: "Deficit (kcal)",
                yAxisId: "left",
              },
            ]}
            yDomain={["dataMin", "dataMax"]}
            referenceLines={[
              {
                x: energySeries[0]?.day ?? "",
                color: "color-mix(in srgb, var(--color-text-tertiary) 25%, transparent)",
              },
            ]}
            height={240}
          />
        </ChartCard>
      </section>

      <section>
        <ChartCard
          title="Macros"
          description={`Daily protein / carbs / fat (g) · ${trustedHint.toLowerCase()}`}
        >
          <MultiLineChartView
            data={macrosData}
            xKey="day"
            lines={[
              {
                dataKey: "protein",
                color: chartPalette.un,
                name: "Protein (g)",
                yAxisId: "left",
              },
              {
                dataKey: "carbs",
                color: chartPalette.cal,
                name: "Carbs (g)",
                yAxisId: "left",
              },
              {
                dataKey: "fat",
                color: chartPalette.gia,
                name: "Fat (g)",
                yAxisId: "left",
              },
            ]}
            yDomain={[0, "dataMax"]}
            height={260}
          />
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        {/* Manual entry form (3 cols) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Log a day manually</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-stone-600">
              Add or update calorie + macro totals for any day. Manual totals
              show on charts whenever present — Apple Health backfill fills gaps
              for days you don&apos;t log yourself.
            </p>
            <form
              action="/api/nutrition/manual"
              method="post"
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="block sm:col-span-2">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Date
                </div>
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={todayIso}
                  max={todayIso}
                  className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
                />
              </label>
              <NumberField name="caloriesKcal" label="Calories (kcal)" placeholder="e.g. 2400" max={20000} />
              <NumberField name="proteinG" label="Protein (g)" placeholder="e.g. 175" max={1000} />
              <NumberField name="carbsG" label="Carbs (g)" placeholder="e.g. 280" max={2000} />
              <NumberField name="fatG" label="Fat (g)" placeholder="e.g. 75" max={1000} />
              <NumberField name="fiberG" label="Fiber (g)" placeholder="optional" max={500} />
              <NumberField name="sugarG" label="Sugar (g)" placeholder="optional" max={2000} />
              <NumberField name="sodiumMg" label="Sodium (mg)" placeholder="optional" max={20000} />
              <NumberField name="saturatedFatG" label="Saturated fat (g)" placeholder="optional" max={500} />
              <label className="block sm:col-span-2">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Notes (optional)
                </div>
                <input
                  name="notes"
                  type="text"
                  maxLength={280}
                  placeholder="e.g. cut day, post-race refeed"
                  className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
                />
              </label>
              <div className="sm:col-span-2 flex items-center gap-3">
                <button className="inline-flex h-10 items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800">
                  Save day
                </button>
                <span className="text-xs text-stone-500">
                  Empty fields are saved as null. Only fill in what you tracked.
                </span>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Recent entries list (2 cols) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent entries</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[color:var(--color-border-subtle)] p-6 text-sm text-stone-500">
                No nutrition data yet. Upload an Apple Health export above or
                log a day manually on the left.
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--color-border-subtle)]">
                {recent.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-stone-900">
                        <span>
                          {row.caloriesKcal != null
                            ? `${Math.round(row.caloriesKcal)} kcal`
                            : "—"}
                        </span>
                        <span className="text-xs font-normal text-stone-500">
                          {weightDayLong(row.date)}
                        </span>
                        <SourcePill source={row.source} shadowed={row.shadowed} />
                      </div>
                      <div className="mt-0.5 text-xs text-stone-500">
                        {row.proteinG != null ? `${Math.round(row.proteinG)} P` : null}
                        {row.proteinG != null && (row.carbsG != null || row.fatG != null) ? " · " : null}
                        {row.carbsG != null ? `${Math.round(row.carbsG)} C` : null}
                        {row.carbsG != null && row.fatG != null ? " · " : null}
                        {row.fatG != null ? `${Math.round(row.fatG)} F` : null}
                        {row.activeEnergyKcal != null ? (
                          <span className="ml-2 text-stone-500">
                            · {Math.round(row.activeEnergyKcal)} kcal active
                          </span>
                        ) : null}
                        {row.notes ? <span className="ml-2 italic text-stone-500">{row.notes}</span> : null}
                      </div>
                    </div>
                    {row.source === "MANUAL" ? (
                      <form action="/api/nutrition/manual" method="post">
                        <input type="hidden" name="_action" value="delete" />
                        <input type="hidden" name="id" value={row.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-stone-500 hover:text-[color:var(--ui-danger)]"
                        >
                          Delete
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-stone-500">
              Showing {recent.length} most recent rows across both sources.{" "}
              <Link
                href="#log-day-manually"
                className="font-medium text-orange-700 underline-offset-2 hover:underline"
              >
                Add another →
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function NumberField({
  name,
  label,
  placeholder,
  max,
}: {
  name: string;
  label: string;
  placeholder?: string;
  max: number;
}) {
  return (
    <label className="block">
      <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
        {label}
      </div>
      <input
        name={name}
        type="number"
        step="any"
        min="0"
        max={max}
        placeholder={placeholder}
        className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
      />
    </label>
  );
}

function ProfileCard({
  profile,
  burnReady,
  hasWeight,
}: {
  profile: {
    heightCm: number | null;
    dateOfBirth: Date | null;
    biologicalSex: BiologicalSex | null;
  };
  burnReady: boolean;
  hasWeight: boolean;
}) {
  const heightInches =
    profile.heightCm != null
      ? Math.round((profile.heightCm / 2.54) * 10) / 10
      : null;
  const dobIso = profile.dateOfBirth
    ? profile.dateOfBirth.toISOString().slice(0, 10)
    : "";

  return (
    <details
      open={!burnReady}
      className="rounded-2xl border border-[color:var(--color-border-subtle)] bg-card/80 p-5 shadow-sm"
    >
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 list-none">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">
            BMR profile
          </h2>
          <p className="mt-1 text-xs text-[color:var(--color-text-tertiary)]">
            {burnReady
              ? `${profile.heightCm!.toFixed(0)} cm · ${profile.biologicalSex} · DOB ${dobIso}`
              : !hasWeight
                ? "Log a weight (Insights → Log a weight) to enable BMR."
                : "Add height, DOB and biological sex to compute BMR."}
          </p>
        </div>
        <span className="text-xs font-medium text-orange-700 underline-offset-2 group-open:hidden">
          Edit
        </span>
      </summary>

      <form
        action="/api/nutrition/profile"
        method="post"
        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="block">
          <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
            Height
          </div>
          <div className="mt-1 flex gap-2">
            <input
              name="height"
              type="number"
              step="0.1"
              min="50"
              max="260"
              placeholder="e.g. 178"
              defaultValue={profile.heightCm ?? ""}
              className="h-10 flex-1 rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
            />
            <select
              name="heightUnit"
              defaultValue="cm"
              className="h-10 rounded-xl border border-amber-950/15 bg-card px-2 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
            >
              <option value="cm">cm</option>
              <option value="in">in</option>
            </select>
          </div>
          {heightInches != null ? (
            <p className="mt-1 text-[11px] text-stone-500">
              ≈ {heightInches.toFixed(1)} in
            </p>
          ) : null}
        </label>

        <label className="block">
          <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
            Date of birth
          </div>
          <input
            name="dateOfBirth"
            type="date"
            defaultValue={dobIso}
            className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
          />
        </label>

        <label className="block">
          <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
            Biological sex
          </div>
          <select
            name="biologicalSex"
            defaultValue={profile.biologicalSex ?? ""}
            className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
          >
            <option value="">Not set</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
          <p className="mt-1 text-[11px] text-stone-500">
            Used by Mifflin–St Jeor.
          </p>
        </label>

        <div className="flex items-end">
          <button className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800">
            Save profile
          </button>
        </div>
      </form>
    </details>
  );
}

function SourcePill({
  source,
  shadowed,
}: {
  source: "BACKFILL" | "MANUAL";
  shadowed?: boolean;
}) {
  if (source === "BACKFILL" && shadowed) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-stone-300/60 bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500"
        title="Not used on charts — a manual entry wins this calendar day"
      >
        Backfill · shadowed
      </span>
    );
  }
  if (source === "BACKFILL") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
        Backfill
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-orange-300/40 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-800">
      Manual
    </span>
  );
}
