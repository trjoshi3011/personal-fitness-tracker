import { kgToLb } from "@/lib/units";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sustainable weight-change rate cap, in kg/day. Roughly 1.5 lb/week —
 * the upper bound of what's broadly considered safe for sustained loss
 * (per Mayo / NIH guidance). We clip both directions so a noisy short
 * window can't produce an alarming projection.
 */
const SAFE_RATE_KG_PER_DAY = 1.5 / 7 / 2.2046226218;

export type WeightSample = {
  date: Date;
  kg: number;
  source: "whoop" | "manual";
};

export type WeightProjectionPoint = {
  day: string;
  dateMs: number;
  actualLb: number | null;
  trendLb: number | null;
  isFuture: boolean;
};

export type WeightProjectionResult = {
  points: WeightProjectionPoint[];
  hasTrend: boolean;
  /** Slope expressed in lb/week (negative = losing). */
  slopePerWeekLb: number;
  /** Trend value at the end of the projection window, in lb. */
  projectedEndLb: number | null;
  /** Trend value at "today" in lb (anchor for the future curve). */
  projectedNowLb: number | null;
  /** `toDayStartMs(now)` — start of the user's calendar "today" (for chart markers). */
  todayZonedDayStartMs: number | null;
  startDateMs: number | null;
  /** First day of the dashed projection segment (often tomorrow if last weighed today). */
  futureStartDateMs: number | null;
  endDateMs: number | null;
  /** Number of measurement points used to fit the line. */
  fitPointCount: number;
  /** R² of the linear fit, 0..1. */
  rSquared: number;
};

/** Start of the UTC calendar day containing `d` (UTC midnight). */
export function utcCalendarDayStartMs(d: Date): number {
  const t = d.getTime();
  return t - (t % DAY_MS);
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

/**
 * Number of calendar-day steps from `startMs` to `targetMs` using the same
 * advance rule as the chart (so x is correct across DST / variable-length days).
 */
function calendarStepsFrom(
  startMs: number,
  targetMs: number,
  advanceDayMs: (ms: number) => number,
): number {
  if (targetMs <= startMs) return 0;
  let cur = startMs;
  let steps = 0;
  while (cur < targetMs) {
    cur = advanceDayMs(cur);
    steps++;
    if (steps > 20000) break;
  }
  return steps;
}

function emptyResult(): WeightProjectionResult {
  return {
    points: [],
    hasTrend: false,
    slopePerWeekLb: 0,
    projectedEndLb: null,
    projectedNowLb: null,
    todayZonedDayStartMs: null,
    startDateMs: null,
    futureStartDateMs: null,
    endDateMs: null,
    fitPointCount: 0,
    rSquared: 0,
  };
}

/**
 * Build a 4-week (configurable) projection of weight using a damped linear
 * regression over the most recent measurements.
 *
 * Pass **every** weight sample you want considered (e.g. WHOOP + manual,
 * pre-merged or not). Samples are grouped by *calendar day* using
 * `toDayStartMs` (default: UTC midnight). When two samples share a calendar
 * day, **manual** wins (whoop is sorted before manual before deduping).
 *
 * Algorithm:
 *  1. Sort by `toDayStartMs(date)`; same-day ties order whoop → manual.
 *  2. Restrict to the last `fitWindowDays` calendar days ending at the most
 *     recent sample's day (inclusive).
 *  3. Dedupe to one kg per calendar day.
 *  4. Fit OLS y = a*x + b where x = days since the first fit point.
 *  5. Clamp slope to ±SAFE_RATE_KG_PER_DAY so a noisy short window can't
 *     extrapolate into something physiologically implausible.
 *  6. Re-anchor intercept to the most recent point so the future curve
 *     visibly starts where the user is *now*, not at the raw OLS line.
 *  7. Emit one chart row per measurement day for the past, then one row per
 *     day from "today" forward for `horizonDays`. The Date passed to
 *     `formatDate` is the calendar-day start, so labels match the user's
 *     timezone view.
 */
export function projectWeight(args: {
  history: WeightSample[];
  horizonDays?: number;
  fitWindowDays?: number;
  formatDate: (d: Date) => string;
  now?: Date;
  /**
   * Optional per-day energy balance (kcal) keyed by the same dayStartMs that
   * `toDayStartMs` returns. Negative = deficit, positive = surplus.
   *
   * When present, we blend the weight-regression slope with the implied
   * slope from energy balance (\(\Delta kg/day \approx kcal/7700\)) to reduce
   * lag and better reflect recent diet-driven change.
   */
  energyBalanceKcalByDayMs?: Map<number, number>;
  /**
   * Maps any Date to the absolute UTC instant that represents the start of
   * its calendar day in whatever frame the caller cares about (typically the
   * user's IANA timezone). Defaults to UTC midnight. Used as the dedupe key
   * AND as the Date passed to `formatDate`, so the chart labels always show
   * the user-facing calendar day.
   */
  toDayStartMs?: (d: Date) => number;
  /**
   * Advance one **calendar** day from a day-start ms value (e.g. user-timezone
   * midnight → next midnight). Defaults to +24h UTC (wrong across DST / near
   * tz boundaries — pass from insights when using `toDayStartMs`).
   */
  advanceCalendarDayMs?: (dayStartMs: number) => number;
  /**
   * Go back one calendar day (pair of `advanceCalendarDayMs` for the fit
   * window). Defaults to −24h UTC.
   */
  retreatCalendarDayMs?: (dayStartMs: number) => number;
}): WeightProjectionResult {
  const horizonDays = args.horizonDays ?? 28;
  const fitWindowDays = args.fitWindowDays ?? 60;
  const now = args.now ?? new Date();
  const toDayStartMs = args.toDayStartMs ?? utcCalendarDayStartMs;
  const advanceDayMs =
    args.advanceCalendarDayMs ?? ((ms: number) => ms + DAY_MS);
  const retreatDayMs =
    args.retreatCalendarDayMs ?? ((ms: number) => ms - DAY_MS);

  const cleaned = args.history
    .filter((s) => Number.isFinite(s.kg) && s.kg > 0 && !Number.isNaN(s.date.getTime()))
    .slice()
    .sort((a, b) => {
      const da = toDayStartMs(a.date);
      const db = toDayStartMs(b.date);
      if (da !== db) return da - db;
      const rank = (src: WeightSample["source"]) => (src === "manual" ? 1 : 0);
      return rank(a.source) - rank(b.source);
    });

  if (cleaned.length === 0) return emptyResult();

  const lastMeasuredMs = toDayStartMs(cleaned[cleaned.length - 1].date);
  let fitStartMs = lastMeasuredMs;
  for (let i = 0; i < fitWindowDays - 1; i++) {
    fitStartMs = retreatDayMs(fitStartMs);
  }
  const fitInputs = cleaned.filter((s) => {
    const dayMs = toDayStartMs(s.date);
    return dayMs >= fitStartMs && dayMs <= lastMeasuredMs;
  });

  const byDay = new Map<number, number>();
  for (const s of fitInputs) {
    byDay.set(toDayStartMs(s.date), s.kg);
  }
  const fitDays = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  const n = fitDays.length;

  const hasTrend = n >= 4;

  const x0 = fitDays[0]?.[0] ?? lastMeasuredMs;
  const xs = fitDays.map(([dMs]) => calendarStepsFrom(x0, dMs, advanceDayMs));
  const ys = fitDays.map(([, kg]) => kg);

  let slope = 0;
  let intercept = ys[0] ?? 0;
  let rSquared = 0;

  if (hasTrend) {
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    const rawSlope = den === 0 ? 0 : num / den;
    const clampedSlope = Math.max(
      -SAFE_RATE_KG_PER_DAY,
      Math.min(SAFE_RATE_KG_PER_DAY, rawSlope),
    );
    const rawIntercept = meanY - rawSlope * meanX;

    const lastX = xs[n - 1];
    const lastY = ys[n - 1];
    intercept = lastY - clampedSlope * lastX;
    slope = clampedSlope;

    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
      const yhat = rawIntercept + rawSlope * xs[i];
      ssRes += (ys[i] - yhat) ** 2;
      ssTot += (ys[i] - meanY) ** 2;
    }
    rSquared = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  }

  // --- Optional: blend in deficit-derived slope ---
  const energy = args.energyBalanceKcalByDayMs;
  if (energy && energy.size > 0) {
    // Compute mean daily energy balance over days that overlap the fit window.
    let sum = 0;
    let cnt = 0;
    for (const [dMs] of fitDays) {
      const v = energy.get(dMs);
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        cnt += 1;
      }
    }
    // If no overlap, use the most recent up-to-14 entries from the map.
    if (cnt === 0) {
      const recent = [...energy.entries()]
        .sort((a, b) => a[0] - b[0])
        .slice(-14);
      for (const [, v] of recent) {
        if (typeof v === "number" && Number.isFinite(v)) {
          sum += v;
          cnt += 1;
        }
      }
    }

    if (cnt > 0) {
      const meanKcal = sum / cnt;
      const deficitSlopeKgPerDay = meanKcal / 7700;
      const clippedDeficitSlope = Math.max(
        -SAFE_RATE_KG_PER_DAY,
        Math.min(SAFE_RATE_KG_PER_DAY, deficitSlopeKgPerDay),
      );

      // Weight slope trust increases with fit quality.
      const weightTrust = hasTrend
        ? Math.max(0.35, Math.min(0.85, rSquared))
        : 0;
      const blended = slope * weightTrust + clippedDeficitSlope * (1 - weightTrust);
      slope = blended;

      // Keep the same "re-anchor to the most recent point" behavior.
      const lastX = xs[n - 1] ?? 0;
      const lastY = ys[n - 1] ?? intercept;
      intercept = lastY - slope * lastX;
    }
  }

  const todayDayMs = toDayStartMs(now);
  const oneDayAfterLastMeasure = advanceDayMs(lastMeasuredMs);
  const futureStartMs = Math.max(oneDayAfterLastMeasure, todayDayMs);

  const points: WeightProjectionPoint[] = [];
  for (const [d, kg] of fitDays) {
    const x = calendarStepsFrom(x0, d, advanceDayMs);
    const trendKg = intercept + slope * x;
    points.push({
      day: args.formatDate(new Date(d)),
      dateMs: d,
      actualLb: round1(kgToLb(kg)),
      trendLb: hasTrend ? round1(kgToLb(trendKg)) : null,
      isFuture: false,
    });
  }
  let projectionEndMs: number | null = null;
  let futureMs = futureStartMs;
  for (let i = 0; i < horizonDays; i++) {
    const x = calendarStepsFrom(x0, futureMs, advanceDayMs);
    const trendKg = intercept + slope * x;
    points.push({
      day: args.formatDate(new Date(futureMs)),
      dateMs: futureMs,
      actualLb: null,
      trendLb: hasTrend ? round1(kgToLb(trendKg)) : null,
      isFuture: true,
    });
    projectionEndMs = futureMs;
    futureMs = advanceDayMs(futureMs);
  }

  const projectedEndKg =
    projectionEndMs != null
      ? intercept +
        slope * calendarStepsFrom(x0, projectionEndMs, advanceDayMs)
      : intercept;
  const projectedNowKg =
    intercept + slope * calendarStepsFrom(x0, todayDayMs, advanceDayMs);

  return {
    points,
    hasTrend,
    slopePerWeekLb: kgToLb(slope * 7),
    projectedEndLb: hasTrend ? round1(kgToLb(projectedEndKg)) : null,
    projectedNowLb: hasTrend ? round1(kgToLb(projectedNowKg)) : null,
    todayZonedDayStartMs: todayDayMs,
    startDateMs: fitDays[0]?.[0] ?? null,
    futureStartDateMs: hasTrend ? futureStartMs : null,
    endDateMs: hasTrend ? projectionEndMs : null,
    fitPointCount: n,
    rSquared,
  };
}
