-- Enable Row Level Security on the two public tables added in recent
-- migrations that didn't get RLS enabled at creation time. Same pattern as
-- the project's earlier RLS migrations: superusers (Prisma's connection)
-- bypass RLS so app behavior is unchanged, but Supabase's security advisor
-- stops flagging these tables for clients hitting the Postgres API directly.

ALTER TABLE "StravaActivityHrZones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ManualWeightLog" ENABLE ROW LEVEL SECURITY;
