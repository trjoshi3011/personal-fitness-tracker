/**
 * Calendar math in a specific IANA timezone (matches User.timezone), without extra deps.
 */

export function localCalendarParts(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const n = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value);
  return { y: n("year"), m: n("month"), d: n("day") };
}

function binarySearchStartOfLocalDay(
  tOnDayMs: number,
  y: number,
  m1: number,
  day: number,
  tz: string,
): Date {
  let lo = tOnDayMs - 30 * 3600_000;
  let hi = tOnDayMs;
  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const p = localCalendarParts(new Date(mid), tz);
    const on = p.y === y && p.m === m1 && p.d === day;
    if (on) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

function findInstantOnLocalCalendarDay(
  year: number,
  month1: number,
  day: number,
  tz: string,
): number {
  const anchor = Date.UTC(year, month1 - 1, day, 12, 0, 0);
  for (let h = -36; h <= 36; h++) {
    const t = anchor + h * 3600_000;
    const p = localCalendarParts(new Date(t), tz);
    if (p.y === year && p.m === month1 && p.d === day) return t;
  }
  return anchor;
}

/** First instant of the given calendar date in `tz` (wall-clock midnight). */
export function startOfZonedCalendarDay(
  year: number,
  month1: number,
  day: number,
  tz: string,
): Date {
  const t = findInstantOnLocalCalendarDay(year, month1, day, tz);
  return binarySearchStartOfLocalDay(t, year, month1, day, tz);
}

/** Length of the month in `tz` (28–31). */
export function daysInZonedMonth(year: number, month1: number, tz: string): number {
  for (let dom = 31; dom >= 28; dom--) {
    const t = findInstantOnLocalCalendarDay(year, month1, dom, tz);
    const p = localCalendarParts(new Date(t), tz);
    if (p.y === year && p.m === month1 && p.d === dom) return dom;
  }
  return 28;
}

export function zonedWeekdaySunday0(d: Date, tz: string): number {
  const w = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(d);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[w] ?? 0;
}

export function zonedMonthGridMeta(year: number, month1: number, tz: string) {
  const daysInMonth = daysInZonedMonth(year, month1, tz);
  const firstOfMonth = startOfZonedCalendarDay(year, month1, 1, tz);
  const leadingBlanks = zonedWeekdaySunday0(firstOfMonth, tz);
  return { daysInMonth, leadingBlanks, firstOfMonth };
}

/** `[start, end)` for DB queries covering the whole zoned calendar month. */
export function zonedMonthRangeUtc(
  year: number,
  month1: number,
  tz: string,
): { start: Date; end: Date } {
  const start = startOfZonedCalendarDay(year, month1, 1, tz);
  const end =
    month1 === 12
      ? startOfZonedCalendarDay(year + 1, 1, 1, tz)
      : startOfZonedCalendarDay(year, month1 + 1, 1, tz);
  return { start, end };
}

export function activeZonedDaysOfMonth(
  dates: Date[],
  tz: string,
  year: number,
  month1: number,
): Set<number> {
  const s = new Set<number>();
  for (const d of dates) {
    const p = localCalendarParts(d, tz);
    if (p.y === year && p.m === month1) s.add(p.d);
  }
  return s;
}

export function currentZonedYearMonth(timeZone: string): {
  year: number;
  month1: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  if (!y || !m) {
    const n = new Date();
    return { year: n.getFullYear(), month1: n.getMonth() + 1 };
  }
  return { year: y, month1: m };
}

export function parseCalendarYearMonth(
  params: { y?: string; m?: string } | undefined,
  timeZone: string,
): { year: number; month1: number } {
  const cur = currentZonedYearMonth(timeZone);
  if (!params?.y || !params?.m) return cur;
  const y = Number(params.y);
  const m = Number(params.m);
  if (!Number.isFinite(y) || y < 1970 || y > 2100) return cur;
  if (!Number.isFinite(m) || m < 1 || m > 12) return cur;
  return { year: y, month1: m };
}

export function shiftZonedMonth(
  year: number,
  month1: number,
  delta: number,
): { year: number; month1: number } {
  const idx = year * 12 + (month1 - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return { year: ny, month1: nm };
}
