import { defineConfig } from "prisma/config";
import { config as dotenvConfig } from "dotenv";

// Prisma CLI does not automatically load `.env.local` like Next.js does.
// Load it explicitly so `prisma generate/migrate` uses the same environment.
dotenvConfig({ path: ".env.local" });
dotenvConfig();

function getDatabaseUrl() {
  const url =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/personal_fitness_tracker?schema=public";

  // Common misconfiguration: setting this to the Supabase project URL (https://...supabase.co).
  if (url.startsWith("http://") || url.startsWith("https://")) {
    throw new Error(
      'DATABASE_URL must be a Postgres connection string (starts with "postgres://" or "postgresql://"), not a Supabase project URL. Get it from Supabase → Project Settings → Database → Connection string.',
    );
  }

  return url;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: getDatabaseUrl(),
  },
});

