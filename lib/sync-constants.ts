/** Max history window for manual / deep sync (stored permanently in DB). */
export const MAX_STRAVA_SYNC_DAYS = 3650;
/** Fitbit daily time-series deep sync: ~6 months (chunked API calls). */
export const MAX_FITBIT_SYNC_DAYS = 183;
/** Exercise log list (runs): allow up to ~12 months for historical tracker runs. */
export const MAX_FITBIT_RUN_LOG_DAYS = 365;
/** Fitbit time-series endpoints are safest in sub-year chunks. */
export const FITBIT_API_CHUNK_DAYS = 90;

/**
 * UTC midnight of the calendar day that is `wholeDays` before the UTC calendar
 * day of `end`. Use for sync windows so we do not drop data from the first part
 * of the oldest day (e.g. `now - 183 * 24h` → Sep 28 12:00 excludes Sep 1–28 AM).
 */
export function utcInclusiveWindowStart(end: Date, wholeDays: number): Date {
  const endDayUtc = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  return new Date(endDayUtc - wholeDays * 86400000);
}
