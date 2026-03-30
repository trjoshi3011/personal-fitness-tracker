-- Prisma’s migration history table lives in public; Supabase’s linter flags it if RLS is off.
-- The Postgres superuser (typical Prisma / `postgres` connection) bypasses RLS, so `prisma migrate` is unaffected.

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
