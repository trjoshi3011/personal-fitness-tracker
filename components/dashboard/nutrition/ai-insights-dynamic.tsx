"use client";

import dynamic from "next/dynamic";

/**
 * Lazy-load AI Nutrition Insights (client-only fetch). Cannot use
 * `dynamic(..., { ssr: false })` from a Server Component — Next requires this wrapper.
 */
export const NutritionAiInsightsLazy = dynamic(
  () =>
    import("@/components/dashboard/nutrition/ai-insights").then((m) => ({
      default: m.NutritionAiInsights,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-36 animate-pulse rounded-2xl border border-[color:var(--color-border-subtle)] bg-[color:var(--ui-accent-soft)]/40"
        aria-hidden
      />
    ),
  },
);

