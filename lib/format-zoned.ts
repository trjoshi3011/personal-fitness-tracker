import { startOfZonedCalendarDay } from "@/lib/zoned-calendar";

export const ZONED_LOCALE = "en-US";

export function formatZoned(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(ZONED_LOCALE, { ...options, timeZone }).format(date);
}

export function formatZonedDateShort(date: Date, timeZone: string): string {
  return formatZoned(date, timeZone, { month: "short", day: "numeric" });
}

export function formatZonedDateShortWithYear(date: Date, timeZone: string): string {
  return formatZoned(date, timeZone, { month: "short", day: "2-digit", year: "numeric" });
}

export function formatZonedWeekdayShortMonthDay(date: Date, timeZone: string): string {
  return formatZoned(date, timeZone, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatZonedWeekdayMonthDayYear(date: Date, timeZone: string): string {
  return formatZoned(date, timeZone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatZonedDateTimeMedium(date: Date, timeZone: string): string {
  return formatZoned(date, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Matches prior lifting table: short month, 2-digit day, year, time. */
export function formatZonedDateTimeLiftingCell(date: Date, timeZone: string): string {
  return formatZoned(date, timeZone, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatZonedCalendarMonthTitle(year: number, month1: number, timeZone: string): string {
  const mid = startOfZonedCalendarDay(year, month1, 15, timeZone);
  return formatZoned(mid, timeZone, { month: "long", year: "numeric" });
}

export function formatZonedYearMonthShort(year: number, month1: number, timeZone: string): string {
  const d = startOfZonedCalendarDay(year, month1, 1, timeZone);
  return formatZoned(d, timeZone, { month: "short", year: "2-digit" });
}

export function formatZonedWeekOfLine(mondayInstant: Date, timeZone: string): string {
  const label = formatZoned(mondayInstant, timeZone, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
  return `Week of ${label}`;
}
