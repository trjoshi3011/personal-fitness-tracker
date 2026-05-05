"use client";

import dynamic from "next/dynamic";

/**
 * Lazy-load AI Coach (client-only fetch). Cannot use `dynamic(..., { ssr: false })`
 * from a Server Component — Next requires this wrapper.
 */
export const AiInsightsLazy = dynamic(
  () =>
    import("@/components/dashboard/ai-insights").then((m) => ({
      default: m.AiInsights,
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
