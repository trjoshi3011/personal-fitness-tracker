-- Enable RLS + add per-user policies for tables added after the initial RLS migration.
-- Supabase Security Advisor flags these when RLS is disabled on public tables.

-- 1) Enable RLS
ALTER TABLE "WhoopWorkout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingPlanWeek" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LiftSessionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LiftSplitWeeklyTarget" ENABLE ROW LEVEL SECURITY;

