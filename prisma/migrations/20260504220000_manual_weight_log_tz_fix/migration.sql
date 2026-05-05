-- Fix manual weight entries that were stored at UTC midnight instead of
-- midnight in the owning user's IANA timezone. With UTC-midnight storage a
-- user in PT submitting "May 28" got back a Date that formats in PT as
-- "May 27 5pm" — i.e. the row appeared on the previous day everywhere.
--
-- For every existing row whose `date` is exactly midnight (the buggy pattern),
-- shift it to the absolute UTC instant equal to wall-clock midnight in the
-- owning user's timezone. Postgres' `AT TIME ZONE` correctly accounts for the
-- DST in effect on that calendar day. The schema column is `timestamp(3)`
-- (no tz), so we round-trip through `timestamptz` and back.
--
-- The `time = 00:00:00` filter is the safety guard: if the migration is
-- re-run, rows that have already been shifted (e.g. to 07:00 for PT during
-- PDT) won't be touched again.

UPDATE "ManualWeightLog" m
SET "date" = (
  ("date"::date AT TIME ZONE COALESCE(NULLIF(u."timezone", ''), 'UTC'))
    AT TIME ZONE 'UTC'
)
FROM "User" u
WHERE m."userId" = u."id"
  AND m."date"::time = TIME '00:00:00';
