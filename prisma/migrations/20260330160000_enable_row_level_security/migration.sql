-- Enable Row Level Security on all app tables in public.
--
-- Why: Supabase’s security advisor warns when RLS is disabled. With RLS off, any
-- access via PostgREST/Realtime using the anon key could expose rows if policies
-- are missing later. Enabling RLS is the recommended default.
--
-- This app uses server-side Prisma with the Postgres connection string. The
-- database superuser (typical for Supabase `postgres`) bypasses RLS, so Prisma
-- queries continue to work unchanged. Roles that are not superuser and do not
-- have BYPASSRLS will see no rows until you add policies (e.g. if you later
-- query these tables from Supabase client in the browser).

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConnectedAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyFitbitStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyWhoopStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StravaActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FitbitActivityLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MonthlyFitnessSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DerivedDailyMetric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncLog" ENABLE ROW LEVEL SECURITY;
