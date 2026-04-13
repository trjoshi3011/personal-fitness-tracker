"use client";

import * as React from "react";
import { Sparkles, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useUserTimezone } from "@/components/providers/user-timezone-provider";
import { formatZonedDateTimeMedium } from "@/lib/format-zoned";
import { cn } from "@/lib/utils";

type InsightSection = {
  emoji: string;
  title: string;
  body: string;
  priority: "high" | "medium" | "low";
};

type AiInsightsResult = {
  summary: string;
  sections: InsightSection[];
  generatedAt: string;
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-orange-500/30 bg-orange-50/50",
  medium: "border-amber-500/20 bg-amber-50/30",
  low: "border-stone-300/30 bg-stone-50/30",
};

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-stone-400",
};

function InsightCard({ section }: { section: InsightSection }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        PRIORITY_STYLES[section.priority] ?? PRIORITY_STYLES.low,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg leading-none" aria-hidden>
          {section.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-900">
              {section.title}
            </h3>
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                PRIORITY_DOT[section.priority] ?? PRIORITY_DOT.low,
              )}
              title={`${section.priority} priority`}
            />
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
            {section.body}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AiInsights() {
  const timeZone = useUserTimezone();
  const [result, setResult] = React.useState<AiInsightsResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);
  const hasGenerated = React.useRef(false);

  const generate = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/generate", { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(
          (json as { error?: string })?.error ?? `Request failed (${res.status})`,
        );
      }
      const data = (await res.json()) as AiInsightsResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (hasGenerated.current) return;
    hasGenerated.current = true;
    generate();
  }, [generate]);

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-900/12 bg-card/80 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-amber-900/8 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-stone-900">
              AI Coach Insights
            </h2>
            <p className="text-[11px] text-stone-500">
              Powered by Gemini — not medical advice
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-900/15 bg-background/60 px-3 text-xs font-medium text-stone-600 transition-all hover:bg-amber-50/60 hover:text-stone-800 disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3 w-3", loading && "animate-spin")}
            />
            {loading ? "Analyzing…" : "Refresh"}
          </button>
          {result && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-amber-50/60 hover:text-stone-700"
              aria-label={collapsed ? "Expand insights" : "Collapse insights"}
            >
              {collapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {loading && !result && (
          <div className="flex flex-col items-center gap-3 py-10">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 animate-ping rounded-full bg-amber-400/30" />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium text-stone-700">
                Analyzing your data…
              </p>
              <p className="text-xs text-stone-500">
                Reviewing 30 days of activity, sleep, and recovery metrics
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {result && (
          <div className={cn("space-y-4", collapsed && "hidden")}>
            {/* Summary */}
            <div className="rounded-xl border border-amber-500/15 bg-gradient-to-r from-amber-50/60 via-yellow-50/40 to-orange-50/30 p-4">
              <p className="text-sm font-medium leading-relaxed text-stone-800">
                {result.summary}
              </p>
            </div>

            {/* Sections sorted by priority */}
            <div className="grid gap-3 md:grid-cols-2">
              {[...result.sections]
                .sort((a, b) => {
                  const order = { high: 0, medium: 1, low: 2 };
                  return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
                })
                .map((s, i) => (
                  <InsightCard key={i} section={s} />
                ))}
            </div>

            {/* Footer */}
            {result.generatedAt && (
              <p className="text-[11px] text-stone-400">
                Generated{" "}
                {formatZonedDateTimeMedium(new Date(result.generatedAt), timeZone)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
