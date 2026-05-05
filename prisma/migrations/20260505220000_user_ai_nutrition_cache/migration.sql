-- Last successful AI Nutrition (Gemini) response per user — avoid regenerating on every visit.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiNutritionInsightsJson" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiNutritionInsightsGeneratedAt" TIMESTAMP(3);

