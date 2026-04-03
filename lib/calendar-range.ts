/** UTC calendar day at 00:00:00.000Z */
export function utcDayStart(y: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(y, monthIndex, day, 0, 0, 0, 0));
}

/**
 * Last `numDays` UTC calendar days inclusive of today (e.g. 30 → today and the 29 prior days).
 */
export function lastNCalendarUtcDaysInclusive(numDays: number, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const end = utcDayStart(y, m, d);
  const start = utcDayStart(y, m, d - (numDays - 1));
  return { start, end, daysInWindow: numDays };
}

/** Inclusive timestamp bounds for filtering activity `startAt` within the UTC calendar window. */
export function utcCalendarWindowBoundsMs(numDays: number, now = new Date()) {
  const { start, end, daysInWindow } = lastNCalendarUtcDaysInclusive(numDays, now);
  const startMs = start.getTime();
  const endMs = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
    23,
    59,
    59,
    999,
  );
  return { startMs, endMs, daysInWindow, startDay: start, endDay: end };
}
