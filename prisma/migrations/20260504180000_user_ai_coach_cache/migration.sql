-- Last successful AI Coach (Gemini) response per user — avoid regenerating on every visit.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiCoachInsightsJson" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiCoachInsightsGeneratedAt" TIMESTAMP(3);
